const Schedule = require('../models/StudentSchedule');
const Slot = require('../models/CourseSlot');
const Offering = require('../models/CourseOffering');
const Request = require('../models/ExtraHoursRequest');
const Course = require('../models/Course');
const { loadContext, evaluateSelection } = require('./extraHoursSubmissionService');
const fail = (message) => Object.assign(new Error(message), { status: 409 });
const overlaps = (a, b) => a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && b.startTime < a.endTime;

// Find a complete non-overlapping combination, rather than taking the first
// lecture and discovering later that it leaves no compatible tutorial/lab.
function chooseSlots(groups, existing) {
  let visits = 0;
  const search = (index, chosen) => {
    if (++visits > 10000) throw fail('Too many slot combinations. Ask your Advisor to assign the requested courses first.');
    if (index === groups.length) return chosen;
    for (const slot of groups[index]) {
      if ([...existing, ...chosen].some((other) => String(other._id) === String(slot._id) || overlaps(slot, other))) continue;
      const result = search(index + 1, [...chosen, slot]);
      if (result) return result;
    }
    return null;
  };
  const selected = search(0, []);
  if (!selected) throw fail('No complete clash-free slots with available seats exist. Ask your Advisor to adjust the draft.');
  return selected;
}
async function prepareActivation(request, session) {
  if (request.history?.some((entry) => entry.action === 'DemoCreated')) throw fail('Synthetic demo requests cannot be paid.');
  const overlap = await Request.findOne({ _id: { $ne: request._id }, student: request.student, term: request.term,
    activatedAt: { $ne: null }, settlementStatus: { $in: ['Paid', 'Deferred to Next Installment'] }, 'items.course': { $in: request.items.map((item) => item.course) } }).session(session).lean();
  if (overlap) throw fail('Extra hours for one of these courses are already activated by another request. Ask your Advisor to resolve the duplicate request.');
  const context = await loadContext(String(request.student), String(request.term), new Date(), session);
  const { quote } = evaluateSelection(context, request.items.map((item) => ({ courseId: String(item.course), requestedHours: item.requestedHours })));
  if (!quote.eligible) throw fail(`Eligibility changed: ${quote.issues.map((issue) => issue.message).join(' ')}`);
  const normalize = (items) => items.map((item) => [String(item.course), item.code, item.name, item.creditHours, item.requestedHours, item.classification, item.ratePerHour, item.subtotal]).sort((a, b) => a[0].localeCompare(b[0]));
  if (quote.totalCost !== request.totalCost || quote.currency !== request.currency || quote.requestedHours !== request.requestedHours || JSON.stringify(normalize(quote.items)) !== JSON.stringify(normalize(request.items))) throw fail('The approved courses or price changed. Ask your Advisor for an updated request.');
  const rows = await Schedule.find({ studentId: request.student, termId: request.term }).populate({ path: 'slotId', populate: { path: 'offeringId' } }).session(session).lean();
  const existing = rows.map((row) => row.slotId).filter(Boolean);
  for (let i = 0; i < existing.length; i++) for (let j = i + 1; j < existing.length; j++) if (overlaps(existing[i], existing[j])) throw fail('The current draft has timetable clashes. Ask your Advisor to correct them first.');
  const groups = [], activatedRowIds = [];
  for (const item of request.items) {
    const course = context.courses.get(String(item.course));
    await Course.updateOne({ _id: course._id, isActive: true }, { $inc: { __v: 1 } }, { session });
    const offering = await Offering.findOne({ courseId: item.course, termId: request.term, publicationStatus: 'Published' }).session(session).lean();
    if (!offering) throw fail('A requested offering is no longer published.');
    // Touch shared catalogue/offering documents to detect concurrent changes.
    await Offering.updateOne({ _id: offering._id }, { $inc: { __v: 1 } }, { session });
    const available = await Slot.find({ offeringId: offering._id }).sort({ groupNumber: 1, _id: 1 }).session(session).lean();
    const assigned = rows.filter((row) => String(row.slotId?.offeringId?._id) === String(offering._id));
    activatedRowIds.push(...assigned.map((row) => row._id));
    for (const [type, hours] of [['Lecture', course.lectureHours], ['Tutorial', course.tutorialHours], ['Lab', course.labHours]]) {
      const count = Math.max(type === 'Lecture' ? 1 : 0, Math.ceil((hours || 0) / 2));
      const have = assigned.filter((row) => row.slotId.slotType === type).length;
      if (have > count) throw fail('The draft has duplicate course slots. Ask your Advisor to correct them.');
      const candidates = [];
      for (const slot of available.filter((slot) => slot.slotType === type && slot.assignedCount < slot.maxCapacity)) {
        const occupants = await Schedule.countDocuments({ slotId: slot._id }).session(session);
        if (occupants < slot.maxCapacity) candidates.push(slot);
      }
      for (let i = have; i < count; i++) groups.push(candidates);
    }
  }
  return { newSlots: chooseSlots(groups, existing), activatedRowIds, maximumHours: quote.maximumTotalHours };
}
// Returns exactly what this activation changed, so Req 102 can undo only that.
async function applyActivation(request, plan, session) {
  const addedSchedules = [], addedSlots = [];
  for (const slot of plan.newSlots) {
    const reserved = await Slot.updateOne({ _id: slot._id, $expr: { $lt: ['$assignedCount', '$maxCapacity'] } }, { $inc: { assignedCount: 1 } }, { session });
    if (!reserved.modifiedCount) throw fail('A selected slot just filled up. Please try again.');
    const [row] = await Schedule.create([{ studentId: request.student, termId: request.term, slotId: slot._id, status: 'Active' }], { session });
    addedSchedules.push(row._id); addedSlots.push(slot._id);
  }
  let activatedDrafts = [];
  if (plan.activatedRowIds.length) {
    const drafts = await Schedule.find({ _id: { $in: plan.activatedRowIds }, status: 'Draft' }).select('_id').session(session).lean();
    activatedDrafts = drafts.map((row) => row._id);
    if (activatedDrafts.length) await Schedule.updateMany({ _id: { $in: activatedDrafts }, status: 'Draft' }, { $set: { status: 'Active' } }, { session });
  }
  return { addedSchedules, addedSlots, activatedDrafts };
}
module.exports = { prepareActivation, applyActivation, chooseSlots, overlaps };
