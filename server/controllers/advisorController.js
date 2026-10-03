const User = require('../models/User');
const Student = require('../models/Student');
const { notifyByEmail } = require('../services/notificationService');
const { sendAdvisorChange } = require('../services/mailService');

/**
 * FR 11.0: Add an advisor using the advisor's GUC email
 * When a valid email is entered, the advisor's full name is displayed.
 */
const addAdvisor = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email format
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Check if email is a valid GUC email (must end with @guc.edu.eg)
    const gucEmailRegex = /^[^@\s]+@guc\.edu\.eg$/;
    if (!gucEmailRegex.test(email.toLowerCase())) {
      return res.status(400).json({ 
        message: 'Invalid email format. Must be a valid GUC email (@guc.edu.eg)' 
      });
    }

    // Check if user with this email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });

    if (existingUser) {
      // User exists - check their role
      if (existingUser.role === 'Advisor') {
        return res.status(400).json({ 
          message: 'This advisor is already in the advising system',
          advisor: {
            fullName: existingUser.fullName,
            email: existingUser.email,
            role: existingUser.role
          }
        });
      } else {
        // User exists but not as advisor - update their role
        existingUser.role = 'Advisor';
        existingUser.isActive = true;
        await existingUser.save();

        // Send notification email (FR 13.0)
        const addedNotice = {
          type: 'info',
          title: 'Added to Advising System',
          message: 'You have been added as an Advisor in the University Schedule Management System.'
        };
        await notifyByEmail(existingUser.email, addedNotice);
        await sendAdvisorChange(existingUser.email, { added: true, name: existingUser.fullName });

        return res.status(200).json({
          message: 'User role updated to Advisor successfully',
          advisor: {
            fullName: existingUser.fullName,
            email: existingUser.email,
            role: existingUser.role
          }
        });
      }
    } else {
      // User doesn't exist - we can't add them (no sign-up allowed per requirements)
      return res.status(404).json({
        message: 'No user found with this email. Users must exist in the system before being added as advisors.',
        hint: 'Ask the administrator to create the user account first.'
      });
    }

  } catch (error) {
    console.error('Error adding advisor:', error);
    res.status(500).json({ message: 'Server error adding advisor', error: error.message });
  }
};

/**
 * FR 12.0: Remove an advisor from the advising system using the advisor's GUC email
 * Removing an advisor does not delete the advisor's previous actions from the schedule activity history.
 */
const removeAdvisor = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find the advisor
    const advisor = await User.findOne({ 
      email: email.toLowerCase(),
      role: 'Advisor'
    });

    if (!advisor) {
      return res.status(404).json({ 
        message: 'No advisor found with this email' 
      });
    }

    // Check if advisor has assigned students
    const assignedStudentsCount = await Student.countDocuments({ 
      assignedAdvisor: advisor._id 
    });

    if (assignedStudentsCount > 0) {
      return res.status(400).json({
        message: `Cannot remove advisor. They have ${assignedStudentsCount} assigned student(s).`,
        hint: 'Reassign their students to another advisor first.',
        assignedStudentsCount
      });
    }

    // Change role from Advisor to Student (or keep account but mark as inactive)
    // Per requirements: "Removing an advisor does not delete the advisor's previous actions"
    // So we keep the account but change the role
    const previousRole = advisor.role;
    advisor.role = 'Student'; // Or you could set isActive = false
    await advisor.save();

    // Send notification email (FR 13.0)
    const removedNotice = {
      type: 'warning',
      title: 'Removed from Advising System',
      message: 'You have been removed as an Advisor from the University Schedule Management System. Your previous actions remain in the system history.'
    };
    await notifyByEmail(advisor.email, removedNotice);
    await sendAdvisorChange(advisor.email, { added: false, name: advisor.fullName });

    res.status(200).json({
      message: 'Advisor removed successfully from the advising system',
      previousRole,
      advisor: {
        fullName: advisor.fullName,
        email: advisor.email,
        currentRole: advisor.role
      },
      note: 'Previous actions in schedule activity history are preserved'
    });

  } catch (error) {
    console.error('Error removing advisor:', error);
    res.status(500).json({ message: 'Server error removing advisor', error: error.message });
  }
};

/**
 * Get list of all advisors
 * Useful for displaying advisors in the UI
 */
const listAdvisors = async (req, res) => {
  try {
    const advisors = await User.find({ role: 'Advisor' })
      .select('fullName email isActive createdAt')
      .sort({ fullName: 1 });

    // Get count of assigned students for each advisor
    const advisorsWithCounts = await Promise.all(
      advisors.map(async (advisor) => {
        const assignedCount = await Student.countDocuments({ 
          assignedAdvisor: advisor._id 
        });
        return {
          _id: advisor._id,
          fullName: advisor.fullName,
          email: advisor.email,
          isActive: advisor.isActive,
          assignedStudentsCount: assignedCount,
          createdAt: advisor.createdAt
        };
      })
    );

    res.status(200).json({
      count: advisorsWithCounts.length,
      advisors: advisorsWithCounts
    });

  } catch (error) {
    console.error('Error listing advisors:', error);
    res.status(500).json({ message: 'Server error listing advisors', error: error.message });
  }
};

/**
 * Get single advisor details including their assigned students
 */
const getAdvisor = async (req, res) => {
  try {
    const { email } = req.params;

    const advisor = await User.findOne({ 
      email: email.toLowerCase(),
      role: 'Advisor'
    }).select('-password -resetPasswordToken -resetPasswordExpires');

    if (!advisor) {
      return res.status(404).json({ message: 'Advisor not found' });
    }

    // Get assigned students
    const assignedStudents = await Student.find({ assignedAdvisor: advisor._id })
      .select('fullName studentId email major currentSemester academicStanding workflowStatus')
      .sort({ fullName: 1 });

    res.status(200).json({
      advisor: {
        _id: advisor._id,
        fullName: advisor.fullName,
        email: advisor.email,
        isActive: advisor.isActive,
        createdAt: advisor.createdAt
      },
      assignedStudents: {
        count: assignedStudents.length,
        students: assignedStudents
      }
    });

  } catch (error) {
    console.error('Error getting advisor:', error);
    res.status(500).json({ message: 'Server error getting advisor', error: error.message });
  }
};

module.exports = {
  addAdvisor,
  removeAdvisor,
  listAdvisors,
  getAdvisor
};
