const { Group, GroupMember, User } = require('../models');

exports.getUserGroups = async (req, res) => {
  try {
    const userId = req.user.id;
    // Find all GroupMembers for this user, include the Group model
    const memberships = await GroupMember.findAll({
      where: { user_id: userId },
    });
    
    // Since we didn't setup GroupMember.belongsTo(Group) cleanly in index.js for this query direction, 
    // we can just fetch the groups directly by ID.
    const groupIds = memberships.map(m => m.group_id);
    const groups = await Group.findAll({ where: { id: groupIds } });
    
    // Attach role to group object for frontend use
    const payload = groups.map(g => {
        const role = memberships.find(m => m.group_id === g.id).role;
        return { ...g.toJSON(), role };
    });

    res.json({ groups: payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
};

exports.createGroup = async (req, res) => {
  try {
    const { name, currency } = req.body;
    const userId = req.user.id;

    const group = await Group.create({ name, currency: currency || 'INR' });

    // Add creator as Admin
    await GroupMember.create({
      group_id: group.id,
      user_id: userId,
      joined_at: new Date(),
      role: 'admin'
    });

    res.status(201).json({ group, role: 'admin' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create group' });
  }
};

exports.addMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { email } = req.body; // Add by email
    const reqUserId = req.user.id;

    // Verify req user is admin of this group
    const adminCheck = await GroupMember.findOne({
      where: { group_id: groupId, user_id: reqUserId, role: 'admin' }
    });
    if (!adminCheck) return res.status(403).json({ error: 'Must be an admin to add members' });

    // Find target user
    const targetUser = await User.findOne({ where: { email } });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // Check if already in group
    const existing = await GroupMember.findOne({
      where: { group_id: groupId, user_id: targetUser.id }
    });
    if (existing) return res.status(400).json({ error: 'User is already in the group' });

    await GroupMember.create({
      group_id: groupId,
      user_id: targetUser.id,
      joined_at: new Date(),
      role: 'member'
    });

    res.json({ message: 'Member added successfully', user: { id: targetUser.id, name: targetUser.name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add member' });
  }
};

exports.getGroupMembers = async (req, res) => {
    try {
        const { groupId } = req.params;
        const memberships = await GroupMember.findAll({
            where: { group_id: groupId }
        });
        const userIds = memberships.map(m => m.user_id);
        const users = await User.findAll({ where: { id: userIds }, attributes: ['id', 'name', 'email'] });
        
        res.json({ members: users });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch members' });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.findAll({ attributes: ['id', 'name', 'email'] });
        res.json({ users });
    } catch(err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};

exports.deleteGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const reqUserId = req.user.id;

        // Verify req user is admin of this group
        const adminCheck = await GroupMember.findOne({
            where: { group_id: groupId, user_id: reqUserId, role: 'admin' }
        });
        if (!adminCheck) return res.status(403).json({ error: 'Must be an admin to delete the group' });

        const group = await Group.findByPk(groupId);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        await group.destroy(); // Cascade delete handles related records

        res.json({ message: 'Group deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete group' });
    }
};
