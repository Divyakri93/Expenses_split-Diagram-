const sequelize = require('../config/database');
const User = require('./User');
const Group = require('./Group');
const GroupMember = require('./GroupMember');
const Expense = require('./Expense');
const ExpenseSplit = require('./ExpenseSplit');
const Message = require('./Message');

// User <-> Group (Many-to-Many via GroupMember)
User.belongsToMany(Group, { through: GroupMember, foreignKey: 'user_id', onDelete: 'CASCADE' });
Group.belongsToMany(User, { through: GroupMember, foreignKey: 'group_id', onDelete: 'CASCADE' });

// Group -> Expense (One-to-Many)
Group.hasMany(Expense, { foreignKey: 'group_id', onDelete: 'CASCADE' });
Expense.belongsTo(Group, { foreignKey: 'group_id', onDelete: 'CASCADE' });

// User -> Expense (Payer)
User.hasMany(Expense, { foreignKey: 'paid_by_user_id', onDelete: 'RESTRICT' });
Expense.belongsTo(User, { as: 'Payer', foreignKey: 'paid_by_user_id', onDelete: 'RESTRICT' });

// Expense -> ExpenseSplit
Expense.hasMany(ExpenseSplit, { foreignKey: 'expense_id', onDelete: 'CASCADE' });
ExpenseSplit.belongsTo(Expense, { foreignKey: 'expense_id', onDelete: 'CASCADE' });

// User -> ExpenseSplit
User.hasMany(ExpenseSplit, { foreignKey: 'user_id', onDelete: 'CASCADE' });
ExpenseSplit.belongsTo(User, { as: 'Participant', foreignKey: 'user_id', onDelete: 'CASCADE' });

// Group -> Message
Group.hasMany(Message, { foreignKey: 'group_id', onDelete: 'CASCADE' });
Message.belongsTo(Group, { foreignKey: 'group_id', onDelete: 'CASCADE' });

// User -> Message
User.hasMany(Message, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Message.belongsTo(User, { as: 'Sender', foreignKey: 'user_id', onDelete: 'CASCADE' });

module.exports = {
  sequelize,
  User,
  Group,
  GroupMember,
  Expense,
  ExpenseSplit,
  Message,
};
