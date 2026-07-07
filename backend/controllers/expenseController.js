const { Expense, ExpenseSplit, User, GroupMember, Message } = require('../models');
const { sequelize } = require('../models');
const Big = require('big.js');
const csv = require('fast-csv');
const { format } = require('date-fns');

const EXCHANGE_RATE_USD_INR = 83.50; // Mock rate

exports.addManualExpense = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { groupId } = req.params;
        const { description, paid_by_user_id, amount, currency, split_type, split_with, split_details, date, notes } = req.body;
        
        // 1. Resolve Exchange Rate
        let ccy = (currency || 'INR').toUpperCase();
        let exchangeRate = 1.0;
        let baseAmount = Number(amount);
        
        if (ccy === 'USD') {
            exchangeRate = EXCHANGE_RATE_USD_INR;
            baseAmount = Big(amount).times(exchangeRate).round(2, Big.roundHalfUp).toNumber();
        }

        // 2. Create Expense
        const exp = await Expense.create({
            group_id: groupId,
            description,
            paid_by_user_id,
            amount: baseAmount,
            currency: ccy,
            exchange_rate_to_base: exchangeRate,
            split_type,
            date,
            notes,
            status: 'active',
            is_settlement: false
        }, { transaction: t });

        // 3. Create Splits
        const members = split_with; // array of userIds
        if (!members || members.length === 0) throw new Error('Must split with at least one member');

        // Logic based on split_type
        if (split_type === 'equal') {
            const splitValue = Big(baseAmount).div(members.length).round(2, Big.roundHalfUp).toNumber();
            for (let userId of members) {
                await ExpenseSplit.create({
                    expense_id: exp.id,
                    user_id: userId,
                    calculated_share_amount: splitValue
                }, { transaction: t });
            }
        } else if (split_type === 'percentage') {
            // split_details is an object: { userId: percentage }
            for (let userId of members) {
                const pct = split_details[userId] || 0;
                const share = Big(baseAmount).times(pct).div(100).round(2, Big.roundHalfUp).toNumber();
                await ExpenseSplit.create({
                    expense_id: exp.id,
                    user_id: userId,
                    calculated_share_amount: share,
                    raw_split_value: pct
                }, { transaction: t });
            }
        } else {
            // Fallback for unequal/share (similar logic applies, we'll assume exact amounts passed for unequal)
             for (let userId of members) {
                const exactAmt = split_details[userId] || 0;
                await ExpenseSplit.create({
                    expense_id: exp.id,
                    user_id: userId,
                    calculated_share_amount: exactAmt,
                    raw_split_value: exactAmt
                }, { transaction: t });
            }
        }

        // 4. Create System Message & Broadcast
        const payerUser = await User.findByPk(paid_by_user_id);
        const payerName = payerUser ? payerUser.name : 'Someone';
        
        // Fetch all participant names for the distribution text
        const participants = await User.findAll({ where: { id: members } });
        const userMap = {};
        participants.forEach(u => userMap[u.id] = u.name);

        // Fetch the generated splits to build the distribution breakdown
        const generatedSplits = await ExpenseSplit.findAll({ where: { expense_id: exp.id }, transaction: t });
        const distributionLines = generatedSplits.map(s => {
            const pName = userMap[s.user_id] || 'Unknown';
            return `• ${pName}: ${ccy} ${s.calculated_share_amount}`;
        }).join('\n');

        const dateTime = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
        const msgContent = `🧾 Expense: "${description}"
📅 Date: ${dateTime}

Total Paid By: ${payerName}
Total Amount: ${ccy} ${amount}

Individual Shares:
${distributionLines}`;

        const sysMessage = await Message.create({
            group_id: groupId,
            user_id: null, // System message
            content: msgContent,
            message_type: 'system_expense'
        }, { transaction: t });

        await t.commit();

        // Broadcast to room
        const io = req.app.get('io');
        if (io) {
           io.to(groupId).emit('new_message', {
               id: sysMessage.id,
               group_id: groupId,
               content: msgContent,
               message_type: 'system_expense',
               created_at: sysMessage.created_at,
               Sender: null
           });
        }

        res.status(201).json({ message: 'Expense added successfully' });
    } catch (err) {
        await t.rollback();
        console.error(err);
        res.status(500).json({ error: err.message || 'Failed to add expense' });
    }
};

exports.exportCSV = async (req, res) => {
    try {
        const { groupId } = req.params;

        // Fetch Expenses with Payer and Splits with Participants
        const expenses = await Expense.findAll({
            where: { group_id: groupId },
            include: [
                { model: User, as: 'Payer', attributes: ['name'] },
                { 
                    model: ExpenseSplit, 
                    include: [{ model: User, as: 'Participant', attributes: ['name'] }] 
                }
            ],
            order: [['date', 'ASC']]
        });

        const csvData = expenses.map(exp => {
            // Reconstruct original amount (reverse base_amount conversion for display)
            // Or just export the stored amount. The prompt wants exact structural match:
            // date | description | paid_by | amount | currency | split_type | split_with | split_details | notes
            
            const originalAmount = exp.currency === 'USD' 
                 ? Big(exp.amount).div(exp.exchange_rate_to_base).round(4).toNumber() 
                 : exp.amount;

            // Format splits
            const splitWithNames = exp.ExpenseSplits.map(s => s.Participant.name).join(';');
            
            let splitDetailsStr = '';
            if (exp.split_type === 'percentage') {
                splitDetailsStr = exp.ExpenseSplits.map(s => `${s.Participant.name}:${s.raw_split_value}%`).join(', ');
            } else if (exp.split_type !== 'equal') {
                splitDetailsStr = exp.ExpenseSplits.map(s => `${s.Participant.name}:${s.raw_split_value}`).join(', ');
            }

            return {
                date: exp.date,
                description: exp.description,
                paid_by: exp.Payer.name,
                amount: originalAmount,
                currency: exp.currency,
                split_type: exp.split_type,
                split_with: splitWithNames,
                split_details: splitDetailsStr,
                notes: exp.notes || ''
            };
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=group_expenses_${groupId}.csv`);

        csv.write(csvData, { headers: true }).pipe(res);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to export CSV' });
    }
};

exports.getExpenses = async (req, res) => {
    try {
        const { groupId } = req.params;
        const expenses = await Expense.findAll({
            where: { group_id: groupId },
            include: [
                { model: User, as: 'Payer', attributes: ['name'] },
                { 
                    model: ExpenseSplit, 
                    include: [{ model: User, as: 'Participant', attributes: ['name'] }] 
                }
            ],
            order: [['date', 'ASC']]
        });
        res.json({ expenses });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch expenses' });
    }
};
