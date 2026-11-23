/**
 * Req 63: how mandatory courses interact with the credit-hour allowance when an
 * advising student's draft schedule is built.
 *
 * The sheet says mandatory courses are selected before other courses and use up
 * the student's available hours, and that "if mandatory courses consume all
 * allowed hours, no other course may be added without approved extra hours".
 *
 * Pure functions only (no models), so the controller and the tests share one
 * definition of the rule.
 */

const sumHours = (courses) => courses.reduce((total, course) => total + (Number(course?.creditHours) || 0), 0);

/**
 * The reason another (non-mandatory) course may not be added yet, or null.
 *
 * Blocked only when the mandatory courses already use every allowed hour AND
 * the new course would take the draft past allowed + approved extra hours.
 * A draft whose mandatory courses leave room is never blocked here: going over
 * the allowance is otherwise a normal step that the extra-hours request covers,
 * and the credit-hour check at review time still applies.
 */
const mandatoryHoursBlock = ({ mandatoryHours, selectedHours, newHours, allowedHours, approvedExtraHours = 0 }) => {
  if (mandatoryHours < allowedHours) return null;
  if (selectedHours + newHours <= allowedHours + approvedExtraHours) return null;
  return `The mandatory courses already use all ${allowedHours} allowed credit hours. Another course needs approved extra hours first.`;
};

/** Mandatory entries of a populated draft, as plain course documents. */
const mandatoryCoursesOf = (entries) =>
  entries.filter((entry) => entry.mandatory && entry.course).map((entry) => entry.course);

module.exports = { sumHours, mandatoryHoursBlock, mandatoryCoursesOf };
