const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getUserGroups, createGroup, addMember, getGroupMembers, getAllUsers, deleteGroup } = require('../controllers/groupController');

const router = express.Router();

// Routes start with /api/groups
router.get('/', protect, getUserGroups);
router.post('/', protect, createGroup);
router.post('/:groupId/members', protect, addMember);
router.get('/:groupId/members', protect, getGroupMembers);

// Helper route to list all users for demo dropdowns
router.get('/users/all', protect, getAllUsers);

router.delete('/:groupId', protect, deleteGroup);

module.exports = router;
