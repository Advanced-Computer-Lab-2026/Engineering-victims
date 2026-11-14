const User = require('../models/User');
const Student = require('../models/Student');

/**
 * Profile for the signed-in account (FR 4.0).
 *
 * For students the academic fields live on the Student directory record (the
 * collection req 6-10 builds), not on the login user — the boot-time seed
 * rewrites the users collection, so reading them from the user document would
 * lose them on every restart. The user document is used as a fallback when no
 * directory record exists yet.
 */
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const profile = { ...user };

    if (user.role === 'Student') {
      const student = await Student.findOne({ email: user.email })
        .populate('assignedAdvisor', 'fullName email')
        .lean();

      if (student) {
        profile.studentId = student.studentId;
        profile.studentType = student.studentType;
        profile.major = student.major;
        profile.currentSemester = student.currentSemester;
        profile.academicStanding = student.academicStanding;
        profile.workflowStatus = student.workflowStatus;
        profile.isActive = student.isActive;
        profile.assignedAdvisor = student.assignedAdvisor ?? null;
      }
    }

    res.status(200).json({ user: profile });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
