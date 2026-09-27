const path = require('path');
const process = require('process');

// Set the absolute path to the server's node_modules
process.env.NODE_PATH = '/Users/macbook/Desktop/Engineering-victims/server/node_modules';

const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load env from absolute path
dotenv.config({ path: '/Users/macbook/Desktop/Engineering-victims/server/.env' });

// Load User model using an absolute path
const User = require('/Users/macbook/Desktop/Engineering-victims/server/models/User');

async function seedDB() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI not found in .env file');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB for seeding...');
    
    await User.deleteMany({});
    console.log('Cleared existing users...');

    const testUsers = [
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

    for (const u of testUsers) {
      await User.create(u);
    }

    console.log('✅ Successfully seeded users!');
    console.log('Test with: samy.elgedaily@student.guc.edu.eg / SamySamy2006');
    
  } catch (err) {
    console.error('Error seeding database:', err);
  } finally {
    mongoose.connection.close();
    process.exit();
  }
}

seedDB();
