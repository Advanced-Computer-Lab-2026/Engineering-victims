const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { notifyByEmail } = require('../services/notificationService');

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

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    user.resetPasswordToken = otp;
    user.resetPasswordExpires = expires;
    await user.save();
    console.log('\n' + '='.repeat(40));
    console.log('📧 [EMAIL SERVICE] SIMULATED EMAIL');
    console.log(`To: ${user.email}`);
    console.log(`Message: Your password reset code is: ${otp}`);
    console.log('='.repeat(40) + '\n');
    res.status(200).json({ message: 'Password reset code sent to email!' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const user = await User.findOne({ email: email.toLowerCase(), resetPasswordToken: otp, resetPasswordExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ message: 'Invalid or expired OTP' });
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Req 2: a security event the account should see next time it signs in.
    // Never carries the OTP or the password itself.
    await notifyByEmail(user.email, {
      type: 'warning',
      title: 'Your password was changed',
      message:
        'The password for your GUC account was updated. If this was not you, contact your coordinator immediately.',
      link: '/notifications',
    });

    res.status(200).json({ message: 'Password updated successfully!' });
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
    // Same source of truth as the boot-time seed, so hitting this route can
    // never leave the database with a different set of accounts.
    const result = await require('../config/seedData').seed();
    res.status(200).json({ message: 'Database seeded successfully!', ...result });
  } catch (error) {
    res.status(500).json({ message: 'Seeding failed', error: error.message });
  }
};
