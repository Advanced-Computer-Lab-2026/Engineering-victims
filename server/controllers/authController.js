const User = require('../models/User');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Please provide both email and password' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });
    if (!user.isActive) return res.status(403).json({ message: 'Your account is currently inactive.' });
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password' });
    const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });
    res.status(200).json({ token, user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.seed = async (req, res) => {
  try {
    await User.deleteMany({});
    const testUsers = [
      { fullName: 'Samy Elgedaily', email: 'samy.elgedaily@student.guc.edu.eg', password: 'SamySamy2006', role: 'Student', studentId: 'S12345', major: 'Computer Science', isActive: true },
      { fullName: 'Dr. Advisor', email: 'advisor@guc.edu.eg', password: 'password123', role: 'Advisor', isActive: true },
      { fullName: 'Admin User', email: 'admin@guc.edu.eg', password: 'password123', role: 'Administrator', isActive: true }
    ];
    for (const u of testUsers) { await User.create(u); }
    res.status(200).json({ message: 'Database seeded successfully!' });
  } catch (error) {
    res.status(500).json({ message: 'Seeding failed', error: error.message });
  }
};
