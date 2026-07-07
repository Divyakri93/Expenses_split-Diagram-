const { User, Expense, ExpenseSplit } = require('../models');
const Big = require('big.js');
Big.RM = 2; // Banker's Rounding (Half-Even)

exports.calculateSettlements = async (req, res) => {
    try {
        const { groupId } = req.params;

        // 1. Fetch all expenses for this group
        const expenses = await Expense.findAll({
            where: { group_id: groupId, status: 'active' },
            include: [{ model: ExpenseSplit }]
        });

        const balances = {}; // { userId: netBalance (Big.js) }

        expenses.forEach(exp => {
            const payerId = exp.paid_by_user_id;
            
            if (!balances[payerId]) balances[payerId] = Big(0);

            // Add the total amount to payer's credit (if not a settlement)
            // If it's a settlement, the payer is paying back a debt, so they get credited
            if (exp.is_settlement) {
               balances[payerId] = balances[payerId].plus(exp.amount);
            } else {
               balances[payerId] = balances[payerId].plus(exp.amount);
            }

            let totalSplitAmount = Big(0);

            // Deduct from participants
            exp.ExpenseSplits.forEach(split => {
                const pId = split.user_id;
                if (!balances[pId]) balances[pId] = Big(0);
                
                const share = Big(split.calculated_share_amount);
                totalSplitAmount = totalSplitAmount.plus(share);

                if (exp.is_settlement) {
                    balances[pId] = balances[pId].minus(share);
                } else {
                    balances[pId] = balances[pId].minus(share);
                }
            });

            // Handle mathematically unallocated debt (due to missing splits or rounding errors)
            const unallocated = Big(exp.amount).minus(totalSplitAmount);
            if (!unallocated.eq(0)) {
                balances[payerId] = balances[payerId].minus(unallocated);
            }
        });

        // Split into debtors and creditors
        const debtors = [];
        const creditors = [];

        Object.keys(balances).forEach(userId => {
            const val = balances[userId];
            if (val.lt(0)) {
                debtors.push({ userId, amount: val.abs() });
            } else if (val.gt(0)) {
                creditors.push({ userId, amount: val });
            }
        });

        // Sort descending
        debtors.sort((a, b) => b.amount.minus(a.amount).toNumber());
        creditors.sort((a, b) => b.amount.minus(a.amount).toNumber());

        const settlements = [];

        let d = 0;
        let c = 0;

        while (d < debtors.length && c < creditors.length) {
            const debtor = debtors[d];
            const creditor = creditors[c];

            const minAmount = debtor.amount.lt(creditor.amount) ? debtor.amount : creditor.amount;

            settlements.push({
                from: debtor.userId,
                to: creditor.userId,
                amount: minAmount.round(4).toNumber()
            });

            debtor.amount = debtor.amount.minus(minAmount);
            creditor.amount = creditor.amount.minus(minAmount);

            if (debtor.amount.eq(0)) d++;
            if (creditor.amount.eq(0)) c++;
        }

        // Map User IDs to Names for UI
        const users = await User.findAll();
        const userMap = {};
        users.forEach(u => userMap[u.id] = u.name);

        const namedSettlements = settlements.map(s => ({
            fromName: userMap[s.from] || 'Unknown',
            toName: userMap[s.to] || 'Unknown',
            amount: s.amount
        }));

        res.json({ settlements: namedSettlements, rawBalances: balances });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to calculate settlements' });
    }
};

exports.getAuditTrail = async (req, res) => {
    try {
        const { userId } = req.params;

        // Fetch all expenses where user is payer OR participant
        const paidExpenses = await Expense.findAll({
            where: { paid_by_user_id: userId, status: 'active' },
            include: [{ model: ExpenseSplit }]
        });

        const splitExpenses = await ExpenseSplit.findAll({
            where: { user_id: userId },
            include: [{ model: Expense }]
        });

        const auditTrail = [];
        
        // Format Paid
        paidExpenses.forEach(e => {
            auditTrail.push({
                date: e.date,
                description: e.description,
                type: 'PAID',
                original_amount: e.amount,
                currency: e.currency,
                exchange_rate: e.exchange_rate_to_base,
                impact: Number(e.amount) // Increases net balance
            });

            // Calculate if there's any unallocated debt for this expense that falls back to the payer
            let totalSplit = Big(0);
            e.ExpenseSplits.forEach(s => totalSplit = totalSplit.plus(s.calculated_share_amount));
            const unallocated = Big(e.amount).minus(totalSplit);

            if (unallocated.abs().gt(0.0001)) {
                auditTrail.push({
                    date: e.date,
                    description: `${e.description} (Unallocated Error/Rounding)`,
                    type: 'OWE',
                    original_amount: e.amount,
                    currency: e.currency,
                    exchange_rate: e.exchange_rate_to_base,
                    split_share: unallocated.toNumber(),
                    impact: unallocated.times(-1).toNumber()
                });
            }
        });

        // Format Splits
        splitExpenses.forEach(s => {
            const e = s.Expense;
            if (e.status !== 'active') return;
            auditTrail.push({
                date: e.date,
                description: e.description,
                type: 'OWE',
                original_amount: e.amount,
                currency: e.currency,
                exchange_rate: e.exchange_rate_to_base,
                split_share: s.calculated_share_amount,
                impact: -s.calculated_share_amount // Decreases net balance
            });
        });

        // Sort by date
        auditTrail.sort((a, b) => new Date(a.date) - new Date(b.date));

        res.json({ auditTrail });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch audit trail' });
    }
};
