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

app.get('/', (req, res) => res.send('University Schedule Management API is running...'));

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/university_schedule');
    console.log('Connected to MongoDB');

    // --- AUTOMATIC SEEDING LOGIC ---
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('Database is empty. Seeding test users...');
      const seedUsers = [
        {
          fullName: 'Samy Elgedaily',
          email: 'samy.elgedaily@student.guc.edu.eg',
          password: 'SamySamy2006',
          role: 'Student',
          studentId: 'S12345',
          major: 'Computer Science',
          isActive: true,
        },
        {
          fullName: 'Test Advisor',
          email: 'advisor@guc.edu.eg',
          password: 'password123',
          role: 'Advisor',
          isActive: true,
        },
        {
          fullName: 'Test Admin',
          email: 'admin@guc.edu.eg',
          password: 'password123',
          role: 'Administrator',
          isActive: true,
        }
      ];
      
      // Use User.create to ensure passwords get hashed by the middleware
      await User.create(seedUsers);
      console.log('✅ Database seeded successfully!');
      console.log('You can now log in with: samy.elgedaily@student.guc.edu.eg / SamySamy2006');
    } else {
      console.log('Database already contains users. Skipping seed.');
    }
    // -------------------------------

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Startup error:', err);
  }
}

startServer();
