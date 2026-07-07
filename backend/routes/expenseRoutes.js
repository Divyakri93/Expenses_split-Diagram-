const express = require('express');
const multer = require('multer');
const csvSanitizer = require('../controllers/csvSanitizer');
const settlementController = require('../controllers/settlementController');

const { protect } = require('../middleware/authMiddleware');
const expenseController = require('../controllers/expenseController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// CSV Import Route
router.post('/import', protect, upload.single('file'), csvSanitizer.processCSV);


// Commit Validated Data
router.post('/commit', protect, csvSanitizer.commitData);

// Settlement Route
router.get('/settlements/:groupId', protect, settlementController.calculateSettlements);

// Audit Trail Route
router.get('/audit/:userId', protect, settlementController.getAuditTrail);

// Manual Expense Logging
router.post('/:groupId', protect, expenseController.addManualExpense);

// Get All Expenses
router.get('/:groupId/all', protect, expenseController.getExpenses);

// CSV Export
router.get('/:groupId/export-csv', protect, expenseController.exportCSV);

module.exports = router;
