const Course = require('../models/Course');
const CourseRecord = require('../models/CourseRecord');
const { requiredCourseFilter } = require('./academicHistoryService');
const { deriveBachelorEligibility } = require('./advisingOverviewService');

/**
 * Req 60 may only be applied to a student who is eligible under req 59. This
 * loads the same records req 59 does and runs the same pure rule, so the two
 * can never disagree about who is eligible.
 */
const loadBachelorEligibility = async (student) => {
  const [records, catalogue] = await Promise.all([
    CourseRecord.find({ student: student._id }).populate('course', 'code name creditHours').lean(),
    Course.find(requiredCourseFilter(student)).select('code name creditHours recommendedSemester').lean(),
  ]);
  return deriveBachelorEligibility({ records, catalogue });
};

module.exports = { loadBachelorEligibility };
