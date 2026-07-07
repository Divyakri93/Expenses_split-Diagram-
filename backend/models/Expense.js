const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Expense = sequelize.define('Expense', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  group_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  paid_by_user_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(12, 4),
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
  },
  exchange_rate_to_base: {
    type: DataTypes.DECIMAL(12, 6),
    allowNull: false,
    defaultValue: 1.0,
  },
  split_type: {
    type: DataTypes.ENUM('equal', 'unequal', 'percentage', 'share'),
    allowNull: false,
    defaultValue: 'equal',
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  notes: {
    type: DataTypes.TEXT,
  },
  is_settlement: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  status: {
    type: DataTypes.ENUM('active', 'pending_approval', 'rejected'),
    defaultValue: 'active',
  },
}, {
  tableName: 'expenses',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    {
      name: 'idx_expenses_group_date',
      fields: ['group_id', 'date']
    }
  ]
});

module.exports = Expense;
