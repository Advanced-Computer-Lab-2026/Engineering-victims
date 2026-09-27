const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const authRoutes = require('./routes/authRoutes');
const User = require('./models/User');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use('/api/auth', authRoutes);
app.get('/', (req, res) => res.send('API running...'));

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/university_schedule');
    console.log('Connected to MongoDB');

    // FORCE SEED EVERY TIME ON START
    console.log('Syncing test users...');
    await User.deleteMany({});
    const testUsers = [
      { fullName: 'Samy Elgedaily', email: 'samy.elged hoodies.guc.edu.eg', password: 'SamySamy2006', role: 'Student', isActive: true },
      { fullName: 'Dr. Advisor', email: 'advisor@guc.edu.eg', password: 'password123', role: 'Advisor', isActive: true },
      { fullName: 'Admin User', email: 'admin@guc.edu.eg', password: 'password123', role: 'Administrator', isActive: true }
    ];
    // Note: I fixed a typo in Samy's email here too.
    await User.create([
      { fullName: 'Samy Elgedaily', email: 'samy.elgedaily@student.guc.edu.eg', password: 'SamySamy2006', role: 'Student', isActive: true },
      { fullName: 'Dr. Advisor', email: 'advisor@guc.edu.eg', password: 'password123', role: 'Advisor', isActive: true },
      { fullName: 'Admin User', email: 'admin@guc.edu.eg', password: 'password123', role: 'Administrator', isActive: true }
    ]);
    console.log('✅ All test users created and hashed!');

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Startup error:', err);
  }
}

startServer();
