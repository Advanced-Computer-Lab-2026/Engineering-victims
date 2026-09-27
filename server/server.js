const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const User = require('./models/User');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);

app.get('/', (req, res) => res.send('API running...'));

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/university_schedule');
    console.log('Connected to MongoDB');

    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('Seeding test users...');
      const created = await User.create([
        { fullName: 'Samy Elgedaily', email: 'samy.elgedaily@student.guc.edu.eg', password: 'SamySamy2006', role: 'Student', studentId: '64-12345', studentType: 'Normal Student', major: 'CS', currentSemester: 5, academicStanding: 'Good Academic Standing', scheduleStatus: 'Schedule Assigned', isActive: true },
        { fullName: 'Dr. Advisor', email: 'advisor@guc.edu.eg', password: 'password123', role: 'Advisor', isActive: true },
        { fullName: 'Admin User', email: 'admin@guc.edu.eg', password: 'password123', role: 'Administrator', isActive: true }
      ]);

      // Link the seeded student to the seeded advisor (assignedAdvisor ref)
      const advisorDoc = created.find((u) => u.role === 'Advisor');
      const studentDoc = created.find((u) => u.role === 'Student');
      if (advisorDoc && studentDoc) {
        studentDoc.assignedAdvisor = advisorDoc._id;
        await studentDoc.save();
      }

      console.log('✅ Test users created!');
    }

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Startup error:', err);
  }
}

startServer();
