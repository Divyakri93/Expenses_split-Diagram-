const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getMessages, sendMessage } = require('../controllers/messageController');

const router = express.Router();

router.get('/:groupId', protect, getMessages);
router.post('/:groupId', protect, sendMessage);

module.exports = router;
