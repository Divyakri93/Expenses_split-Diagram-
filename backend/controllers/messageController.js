const { Message, User } = require('../models');

exports.getMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const messages = await Message.findAll({
      where: { group_id: groupId },
      include: [{ model: User, as: 'Sender', attributes: ['name', 'id'] }],
      order: [['created_at', 'ASC']],
    });
    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    const message = await Message.create({
      group_id: groupId,
      user_id: userId,
      content,
      message_type: 'chat',
    });

    // Fetch with sender info to broadcast
    const msgWithSender = await Message.findByPk(message.id, {
      include: [{ model: User, as: 'Sender', attributes: ['name', 'id'] }]
    });

    // Broadcast to Socket.IO room
    const io = req.app.get('io');
    if (io) {
      io.to(groupId).emit('new_message', msgWithSender);
    }

    res.status(201).json({ message: msgWithSender });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send message' });
  }
};
