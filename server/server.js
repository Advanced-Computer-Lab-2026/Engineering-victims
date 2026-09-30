const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const { ensureEnvFile, DEFAULT_MONGO_URI } = require('./config/ensureEnv');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const studentRoutes = require('./routes/studentRoutes');
const academicTermRoutes = require('./routes/academicTermRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const advisorRoutes = require('./routes/advisorRoutes');
const courseRoutes = require('./routes/courseRoutes');
const offeringRoutes = require('./routes/offeringRoutes');
const walletRoutes = require('./routes/walletRoutes');
const academicHistoryRoutes = require('./routes/academicHistoryRoutes');
const { seed } = require('./config/seedData');

// Create server/.env (and the MongoDB connection string) if it is missing.
if (ensureEnvFile()) {
  console.log('Created server/.env with a default local MongoDB connection.');
}

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/terms', academicTermRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/advisors', advisorRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/offerings', offeringRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/academic-history', academicHistoryRoutes);
app.get('/', (req, res) => res.send('API running...'));

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_MONGO_URI;

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET is not set. Sessions will not survive a restart.');
}

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const { users, students, courses, notifications } = await seed();
    console.log(`✅ Seeded ${users} users, ${students} students, ${courses} courses and ${notifications} notifications`);

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Startup error:', err.message);
    console.error(`\nCould not connect to MongoDB at: ${MONGODB_URI}`);
    console.error('Check that MongoDB is running, or set MONGODB_URI in server/.env');
    process.exit(1);
  }
}

startServer();
