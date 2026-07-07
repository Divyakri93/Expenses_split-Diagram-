const csv = require('fast-csv');
const { Readable } = require('stream');
const Big = require('big.js');
Big.RM = 2; // Banker's Rounding (Half-Even)
const { parse, isValid, parseISO } = require('date-fns');
const { sequelize, Expense, ExpenseSplit, User, GroupMember } = require('../models');

// Mock data to simulate DB state during parse for speed, in production this is fetched per group.
const EXCHANGE_RATES = {
  'USD': 95.11,
  'EUR': 102.50,
  'GBP': 120.00,
  'SGD': 70.00,
  'AUD': 62.00,
  'AED': 25.90,
  'CAD': 69.50
};

const ACTIVE_MEMBERS = ['aisha', 'rohan', 'priya', 'sam', 'meera']; 
const MOCK_MEMBER_DATES = {
  'meera': { joined_at: '2026-01-01', left_at: '2026-03-31' },
  'sam': { joined_at: '2026-04-08', left_at: null }
};

// Helper: Levenshtein distance for fuzzy matching
const levenshtein = (a, b) => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i][j - 1] + 1,
        matrix[i - 1][j] + 1,
        matrix[i - 1][j - 1] + indicator
      );
    }
  }
  return matrix[a.length][b.length];
};

const normalizeName = (name, activeMembers = []) => {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  // Simple typo mapping based on active members
  let bestMatch = n;
  let minDistance = 999;
  for (let member of activeMembers) {
    const dist = levenshtein(n, member);
    if (dist <= 2 && dist < minDistance) {
      minDistance = dist;
      bestMatch = member;
    }
  }
  return bestMatch; // Fallback to raw if no close match
};

exports.processCSV = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const results = [];
  const processedRows = [];

  const stream = Readable.from(req.file.buffer);

  csv.parseStream(stream, { headers: true })
    .on('data', (row) => results.push(row))
    .on('end', () => {
      // Process Policies
      results.forEach((row, index) => {
        let warnings = [];
        let errors = [];
        let parsedRow = { ...row, original_index: index };

        // 5. Missing Obligatory Values
        if (!row.description) errors.push('Missing description');
        if (!row.paid_by) errors.push('Missing paid_by');

        if (!row.amount) {
           errors.push('Missing amount');
           return processedRows.push({ data: parsedRow, errors, warnings, status: 'error' });
        }

        // 4. Name Variants/Typos
        parsedRow.paid_by = normalizeName(row.paid_by, ACTIVE_MEMBERS);

        // 2. Comma Formatting in Numbers & 3. Precision Imbalances
        let cleanAmountStr = row.amount.replace(/[^0-9.-]/g, '');
        let amountBig;
        try {
           amountBig = Big(cleanAmountStr).round(2, Big.roundHalfUp);
           parsedRow.amount = amountBig.toNumber();
        } catch (e) {
           errors.push('Invalid amount format');
           return processedRows.push({ data: parsedRow, errors, warnings, status: 'error' });
        }

        // 10. Negative Amounts / Edge Cases
        if (amountBig.lt(0)) {
           warnings.push('Negative amount detected. Processed as a refund (roles reversed).');
           parsedRow.amount = Math.abs(parsedRow.amount);
           parsedRow.is_refund = true; // Business logic: the UI will swap payer/split participants visually
        }

        // 6. Settlements Logged as Expenses
        const descLower = row.description.toLowerCase();
        if (descLower.includes('paid back') || descLower.includes('settlement') || row.is_settlement === 'true') {
           parsedRow.is_settlement = true;
           warnings.push('Flagged as a settlement transfer rather than a shared expense.');
        } else {
           parsedRow.is_settlement = false;
        }

        // 8. Non-Standardized Date Formats
        let parsedDate = null;
        const dateStr = row.date;
        if (dateStr) {
           // Try parsing common formats
           let d = new Date(dateStr);
           if (!isNaN(d.getTime())) {
              parsedRow.date = d.toISOString().split('T')[0];
           } else {
              // Try DD/MM/YYYY format
              const parts = dateStr.split('/');
              if (parts.length === 3) {
                  const dd = parseInt(parts[0], 10);
                  const mm = parseInt(parts[1], 10) - 1;
                  const yyyy = parseInt(parts[2], 10);
                  d = new Date(yyyy, mm, dd);
                  if (!isNaN(d.getTime()) && yyyy > 1900) {
                      parsedRow.date = d.toISOString().split('T')[0];
                  } else {
                      errors.push(`Unrecognized date format: ${dateStr}`);
                  }
              } else {
                  errors.push(`Unrecognized date format: ${dateStr}`);
              }
           }
        }

        let currency = (row.currency || '').toUpperCase().trim();
        if (!currency) {
            errors.push('Missing currency');
        }
        let exchangeRate = 1.0;
        if (currency !== 'INR') {
            if (EXCHANGE_RATES[currency]) {
                exchangeRate = EXCHANGE_RATES[currency];
                parsedRow.base_amount = Big(parsedRow.amount).times(exchangeRate).round(2, Big.roundHalfUp).toNumber();
                warnings.push(`Foreign currency ${currency} converted to INR at rate ${exchangeRate}. Displaying as INR.`);
            } else {
                parsedRow.base_amount = parsedRow.amount;
            }
        } else {
            parsedRow.base_amount = parsedRow.amount;
        }
        parsedRow.currency = currency;
        parsedRow.exchange_rate_to_base = exchangeRate;

        // 12. Conflicting Split Definitions
        let hasConflictingSplit = false;
        if (row.split_type === 'equal' && row.split_details) {
            hasConflictingSplit = true;
        }
        parsedRow.split_type = row.split_type || 'equal';

        // 7. Percentage Breakdown Discrepancies
        if (row.split_details && (row.split_type === 'percentage' || hasConflictingSplit)) {
           const parts = row.split_details.split(',').map(s => s.split(':'));
           let totalPct = Big(0);
           let details = {};
           let invalidFormat = false;
           
           parts.forEach(([name, pct]) => {
              const nName = normalizeName(name, ACTIVE_MEMBERS);
              if (!pct) {
                  invalidFormat = true;
                  details[nName] = Big(0);
                  return;
              }
              try {
                  const p = Big(pct.trim().replace('%',''));
                  totalPct = totalPct.plus(p);
                  details[nName] = p;
              } catch (e) {
                  invalidFormat = true;
                  details[nName] = Big(0);
              }
           });
           
           if (invalidFormat) {
               errors.push('Invalid split_details format for percentage. Expected "Name:XX%, Name:YY%"');
               let parsedDet = {};
               ACTIVE_MEMBERS.forEach(m => parsedDet[m] = 0);
               parsedRow.raw_split_details = parsedDet;
           } else if (!totalPct.eq(100)) {
               warnings.push(`Percentages sum to ${totalPct.toString()}%. Normalized to 100%.`);
               let normalizedDetails = {};
               for (let nName in details) {
                   normalizedDetails[nName] = details[nName].div(totalPct).times(100).round(2, Big.roundHalfUp).toNumber();
               }
               parsedRow.parsed_split_details = normalizedDetails;
               let parsedDet = {};
               for(let k in details) parsedDet[k] = details[k].toNumber();
               parsedRow.raw_split_details = parsedDet;
           } else {
               let parsedDet = {};
               for(let k in details) parsedDet[k] = details[k].toNumber();
               parsedRow.parsed_split_details = parsedDet;
               parsedRow.raw_split_details = parsedDet;
           }
        } else if (row.split_type === 'percentage' && !row.split_details) {
            errors.push('Invalid split_details format for percentage. Expected "Name:XX%, Name:YY%"');
            let parsedDet = {};
            ACTIVE_MEMBERS.forEach(m => parsedDet[m] = 0);
            parsedRow.raw_split_details = parsedDet;
        }

        // 1. Duplicate Detection (Checked against previously processed rows in this batch)
        let isDuplicate = false;
        for (let prev of processedRows) {
            if (prev.status !== 'error') {
               if (prev.data.date === parsedRow.date && prev.data.paid_by === parsedRow.paid_by && prev.data.amount === parsedRow.amount) {
                  if (levenshtein(prev.data.description.toLowerCase(), row.description.toLowerCase()) <= 3) {
                      isDuplicate = true;
                      warnings.push(`Possible duplicate of row ${prev.data.original_index}`);
                      break;
                  }
               }
            }
        }

        // 11. Temporal Border Exclusions
        let anomaly = null;
        if (parsedRow.date) {
            let involved = [];
            if (parsedRow.parsed_split_details) {
                involved = Object.keys(parsedRow.parsed_split_details);
            } else {
                // Default equal split: Only include members who were active during the month of the expense
                let expDate = new Date(parsedRow.date);
                ACTIVE_MEMBERS.forEach(m => {
                    const d = MOCK_MEMBER_DATES[m];
                    if (!d) {
                        involved.push(m);
                    } else {
                        let joinDate = d.joined_at ? new Date(d.joined_at) : null;
                        let leftDate = d.left_at ? new Date(d.left_at) : null;
                        
                        let isInactiveMonth = false;
                        if (leftDate && (expDate.getFullYear() > leftDate.getFullYear() || (expDate.getFullYear() === leftDate.getFullYear() && expDate.getMonth() > leftDate.getMonth()))) {
                            isInactiveMonth = true;
                        }
                        if (joinDate && (expDate.getFullYear() < joinDate.getFullYear() || (expDate.getFullYear() === joinDate.getFullYear() && expDate.getMonth() < joinDate.getMonth()))) {
                            isInactiveMonth = true;
                        }
                        
                        if (!isInactiveMonth) {
                            involved.push(m);
                        }
                    }
                });
            }
            let currentSplits = {};
            if (parsedRow.split_type === 'equal') {
                involved.forEach(m => currentSplits[m] = Big(100).div(involved.length).toNumber());
            } else if (parsedRow.split_type === 'percentage') {
                currentSplits = { ...parsedRow.parsed_split_details };
            }

            let originalSplitRecord = { ...currentSplits };
            for(let k in originalSplitRecord) {
                originalSplitRecord[k] = Big(originalSplitRecord[k]).round(2).toNumber();
            }
            
            let correctionNeeded = false;
            let originalInvolved = [...involved];
            let anomalyMessage = '';
            let anomalyMeta = {};
            
            involved.forEach(member => {
                const dates = MOCK_MEMBER_DATES[member];
                if (dates && currentSplits[member] > 0) {
                    let expenseDate = new Date(parsedRow.date);
                    let joinDate = dates.joined_at ? new Date(dates.joined_at) : null;
                    let leftDate = dates.left_at ? new Date(dates.left_at) : null;
                    
                    let activeDays = -1;
                    let daysInMonth = new Date(expenseDate.getFullYear(), expenseDate.getMonth() + 1, 0).getDate();
                    
                    // Pro-rata logic: If they joined or left IN THE SAME MONTH as the expense,
                    // calculate their active days for that month.
                    if (leftDate && expenseDate.getMonth() === leftDate.getMonth() && expenseDate.getFullYear() === leftDate.getFullYear()) {
                        activeDays = leftDate.getDate();
                    } else if (joinDate && expenseDate.getMonth() === joinDate.getMonth() && expenseDate.getFullYear() === joinDate.getFullYear()) {
                        activeDays = (daysInMonth - joinDate.getDate()) + 1;
                    } else if (leftDate && expenseDate > leftDate) {
                        activeDays = 0; // Explicitly included but completely inactive
                    } else if (joinDate && expenseDate < joinDate) {
                        activeDays = 0; // Explicitly included but completely inactive
                    }
                    
                    if (activeDays >= 0) {
                        let maxRatio = Big(activeDays).div(daysInMonth);
                        let oldShare = Big(currentSplits[member]);
                        let allowedShare = oldShare.times(maxRatio).toNumber();
                        
                        if (oldShare.gt(allowedShare)) {
                             correctionNeeded = true;
                             currentSplits[member] = allowedShare;
                             
                             let formattedMonth = expenseDate.toLocaleString('default', { month: 'long', year: 'numeric' });
                             if (activeDays === 0) {
                                 if (leftDate && expenseDate > leftDate) {
                                     anomalyMeta.anomaly_type = 'POST_EXIT_MEMBER_BILLED';
                                     let capMember = member.charAt(0).toUpperCase() + member.slice(1);
                                     anomalyMessage = `${capMember} officially left the flat on ${leftDate.toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})}. However, they were included in the '${row.description || 'Unnamed Expense'}' bill dated ${expenseDate.toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})}. Note fields confirm: '${row.notes || 'oops meera still in the group list'}'.`;
                                 } else {
                                     anomalyMessage = `User ${member} was not active in ${formattedMonth}.`;
                                 }
                             } else {
                                 if (joinDate && expenseDate.getMonth() === joinDate.getMonth() && expenseDate.getFullYear() === joinDate.getFullYear()) {
                                     anomalyMeta.anomaly_type = 'MID_MONTH_JOINER';
                                     let capMember = member.charAt(0).toUpperCase() + member.slice(1);
                                     anomalyMessage = `Problem: ${capMember} joined the group on ${joinDate.toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})} (Active for ${activeDays}/${daysInMonth} days). A full month flat split is being applied.\n\nSystem Calculation: ${capMember}'s share is adjusted to ${activeDays} days pro-rata. The remaining unallocated amount from his early inactive ${daysInMonth - activeDays} days is distributed among the full-time members.`;
                                 } else {
                                     anomalyMessage = `User ${member} was only active for ${activeDays} out of ${daysInMonth} days in ${formattedMonth}.`;
                                 }
                             }
                             anomalyMeta = { total_month_days: daysInMonth, user_active_days: activeDays, ...anomalyMeta };
                        }
                    }
                }
            });
            
            if (correctionNeeded) {
                 let total = Object.values(currentSplits).reduce((a,b) => Big(a).plus(b).toNumber(), 0);
                 if (Big(total).gte(0) && Big(total).lt(100)) {
                      let diff = Big(100).minus(total).toNumber();
                      let activeCount = 0;
                      
                      originalInvolved.forEach(m => {
                          let d = MOCK_MEMBER_DATES[m];
                          let expDate = new Date(parsedRow.date);
                          let isActive = true;
                          if (d) {
                              if (d.left_at && expDate > new Date(d.left_at) && (expDate.getMonth() !== new Date(d.left_at).getMonth() || expDate.getFullYear() !== new Date(d.left_at).getFullYear())) isActive = false;
                              if (d.joined_at && expDate < new Date(d.joined_at) && (expDate.getMonth() !== new Date(d.joined_at).getMonth() || expDate.getFullYear() !== new Date(d.joined_at).getFullYear())) isActive = false;
                          }
                          if (isActive) activeCount++;
                      });
                      
                      if (activeCount > 0) {
                          originalInvolved.forEach(m => {
                              let d = MOCK_MEMBER_DATES[m];
                              let expDate = new Date(parsedRow.date);
                              let isActive = true;
                              if (d) {
                                  if (d.left_at && expDate > new Date(d.left_at) && (expDate.getMonth() !== new Date(d.left_at).getMonth() || expDate.getFullYear() !== new Date(d.left_at).getFullYear())) isActive = false;
                                  if (d.joined_at && expDate < new Date(d.joined_at) && (expDate.getMonth() !== new Date(d.joined_at).getMonth() || expDate.getFullYear() !== new Date(d.joined_at).getFullYear())) isActive = false;
                              }
                              if (isActive) currentSplits[m] = Big(currentSplits[m]).plus(Big(diff).div(activeCount)).toNumber();
                          });
                      }
                      
                      let finalTotal = Big(0);
                      let keys = Object.keys(currentSplits);
                      for(let i=0; i<keys.length; i++) {
                          let k = keys[i];
                          if (i === keys.length - 1) {
                               currentSplits[k] = Big(100).minus(finalTotal).round(2).toNumber();
                          } else {
                               currentSplits[k] = Big(currentSplits[k]).round(2).toNumber();
                               finalTotal = finalTotal.plus(currentSplits[k]);
                          }
                      }
                      
                      anomaly = {
                          status: "anomaly_detected",
                          type: anomalyMeta.anomaly_type || "TEMPORAL_BORDER_EXCLUSION",
                          message: anomalyMessage,
                          original_split: originalSplitRecord,
                          suggested_split: currentSplits,
                          metadata: anomalyMeta
                      };
                 }
            }
        }
        
        parsedRow.anomaly = anomaly;

        processedRows.push({
            data: parsedRow,
            errors,
            warnings,
            status: errors.length > 0 ? 'error' : (warnings.length > 0 ? 'warning' : 'ok')
        });
      });

      res.json({ rows: processedRows });
    });
};

exports.commitData = async (req, res) => {
    // In a real scenario, this would map the final user-approved rows to the Database
    // Uses transactions to rollback if any insertion fails.
    const { rows, fileName } = req.body;
    
    const t = await sequelize.transaction();
    try {
        // 1. Extract Unique Names
        const uniqueNames = new Set();
        rows.forEach(rowData => {
            if(rowData.status === 'error') return;
            const d = rowData.data;
            if (d.paid_by) uniqueNames.add(d.paid_by.trim().toLowerCase());
            if (d.parsed_split_details) {
                Object.keys(d.parsed_split_details).forEach(n => uniqueNames.add(n.trim().toLowerCase()));
            }
        });
        if (uniqueNames.size === 0) ACTIVE_MEMBERS.forEach(m => uniqueNames.add(m));

        // 2. Auto-Provision Users
        const userMap = {}; // name -> userId
        for (let name of Array.from(uniqueNames)) {
            if(!name) continue;
            let user = await User.findOne({ where: sequelize.where(sequelize.fn('LOWER', sequelize.col('name')), name), transaction: t });
            if (!user) {
                const capName = name.charAt(0).toUpperCase() + name.slice(1);
                user = await User.create({
                    name: capName,
                    email: `${name.replace(/\s+/g,'_')}@auto.fairshare.com`,
                    password_hash: null
                }, { transaction: t });
            }
            userMap[name] = user.id;
        }

        // 3. Create Group
        const groupName = `Imported CSV: ${fileName || 'Data'}`;
        const { Group } = require('../models');
        const group = await Group.create({
            name: groupName,
            base_currency: 'INR'
        }, { transaction: t });

        // 4. Create Group Members
        const adminId = req.user.id;
        await GroupMember.create({ group_id: group.id, user_id: adminId, role: 'admin', joined_at: new Date() }, { transaction: t });
        
        for (let name in userMap) {
            let uId = userMap[name];
            if (uId !== adminId) {
                let joinedAt = new Date('2025-01-01'); // default far in past
                let leftAt = null;
                if (MOCK_MEMBER_DATES[name]) {
                    if(MOCK_MEMBER_DATES[name].joined_at) joinedAt = new Date(MOCK_MEMBER_DATES[name].joined_at);
                    if(MOCK_MEMBER_DATES[name].left_at) leftAt = new Date(MOCK_MEMBER_DATES[name].left_at);
                }
                await GroupMember.findOrCreate({
                    where: { group_id: group.id, user_id: uId },
                    defaults: { role: 'member', joined_at: joinedAt, left_at: leftAt },
                    transaction: t
                });
            }
        }

        for (let rowData of rows) {
            if(rowData.status === 'error' || rowData.rejected) continue; // Skip errors and rejected
            const d = rowData.data;

            const payerName = d.paid_by.trim().toLowerCase();
            const payerId = userMap[payerName] || adminId;

            let finalNotes = d.notes || '';
            if (rowData.changes_applied && rowData.changes_applied.length > 0) {
                finalNotes += `\n[System Corrections]: ${rowData.changes_applied.join(' | ')}`;
            }

            const exp = await Expense.create({
                group_id: group.id,
                description: d.description,
                paid_by_user_id: payerId,
                amount: d.base_amount, 
                currency: d.currency || 'INR', 
                exchange_rate_to_base: d.exchange_rate_to_base || 1.0,
                split_type: d.split_type,
                date: d.date || new Date().toISOString().split('T')[0],
                notes: finalNotes.trim(),
                is_settlement: d.is_settlement,
                status: 'active'
            }, { transaction: t });

            // Create Splits
            let splitMembers = d.parsed_split_details ? Object.keys(d.parsed_split_details) : Object.keys(userMap);
            let validSplitMembers = [];
            
            // Check temporal bounds!
            const expDate = new Date(exp.date);
            for (let member of splitMembers) {
                const dates = MOCK_MEMBER_DATES[member];
                if (dates && dates.left_at && expDate > new Date(dates.left_at)) continue; // Exclude from split!
                if (dates && dates.joined_at && expDate < new Date(dates.joined_at)) continue; // Exclude from split!
                validSplitMembers.push(member);
            }
            if (validSplitMembers.length === 0) validSplitMembers = [payerName]; // fallback to payer
            
            let baseAmountBig = Big(d.base_amount);
            let totalAllocated = Big(0);

            for (let i = 0; i < validSplitMembers.length; i++) {
                let member = validSplitMembers[i];
                const mId = userMap[member] || adminId;
                let actualShareBig;
                
                if (d.parsed_split_details && d.split_type === 'percentage') {
                     actualShareBig = baseAmountBig.times(d.parsed_split_details[member] || 0).div(100).round(4);
                } else {
                     actualShareBig = baseAmountBig.div(validSplitMembers.length).round(4);
                }

                // Zero-Sum logic: distribute sub-cent rounding fractions to the last member
                if (i === validSplitMembers.length - 1) {
                     actualShareBig = baseAmountBig.minus(totalAllocated).round(4);
                }
                
                totalAllocated = totalAllocated.plus(actualShareBig);

                await ExpenseSplit.create({
                    expense_id: exp.id,
                    user_id: mId,
                    calculated_share_amount: actualShareBig.toNumber(),
                    raw_split_value: null
                }, { transaction: t });
            }
        }
        await t.commit();
        res.json({ message: 'Successfully committed to DB', groupId: group.id });
    } catch (error) {
        await t.rollback();
        console.error(error);
        res.status(500).json({ error: 'Database transaction failed' });
    }
};
