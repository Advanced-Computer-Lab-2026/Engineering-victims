const crypto = require('crypto');
const StudentSchedule = require('../models/StudentSchedule');
const AcademicTerm = require('../models/AcademicTerm');
const CalendarConnection = require('../models/CalendarConnection');
const CalendarEvent = require('../models/CalendarEvent');
const google = require('./googleCalendarClient');

const DAY = 86400000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const timezone = () => process.env.UNIVERSITY_TIMEZONE || 'Africa/Cairo';
// Academic-term inputs are date-only values, stored by the existing term API at
// UTC midnight. Interpret their YYYY-MM-DD as inclusive university calendar dates.
const dateOnly = (date) => new Date(date).toISOString().slice(0, 10);
const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`);
const dayString = (millis) => new Date(millis).toISOString().slice(0, 10);
function localInstant(date, time, zone) {
  const intended = Date.parse(`${date}T${time}:00Z`);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const wall = (millis) => {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(millis)).map((part) => [part.type, part.value]));
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  };
  let guess = intended;
  for (let i = 0; i < 4; i += 1) {
    const delta = intended - wall(guess);
    if (!delta) return new Date(guess).toISOString();
    guess += delta;
  }
  throw google.fail('A class falls in a daylight-saving time gap. Ask your administrator to check its time.', 422);
}
function buildRecurringEvent(slot, term, zone = timezone()) {
  const startDay = dayNumber(dateOnly(term.teachingStartDate));
  const endDay = dayNumber(dateOnly(term.teachingEndDate));
  const weekday = WEEKDAYS.indexOf(slot.dayOfWeek);
  if (weekday < 0 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.startTime) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.endTime) || slot.endTime <= slot.startTime || endDay < startDay) {
    throw google.fail('The processed schedule contains invalid teaching dates or class times.', 422);
  }
  const first = startDay + ((weekday - new Date(startDay).getUTCDay() + 7) % 7) * DAY;
  if (first > endDay) return null;
  const course = slot.offeringId?.courseId;
  if (!course?.code || !course?.name) throw google.fail('A scheduled course is missing. Ask your administrator to repair the schedule.', 422);
  return {
    summary: `${course.code} — ${course.name} (${slot.slotType})`,
    location: slot.roomId || '',
    description: [
      `Course: ${course.code} — ${course.name}`, `Slot: ${slot.slotType}`,
      `Time: ${slot.startTime}–${slot.endTime} (${zone})`,
      ...(slot.roomId ? [`Room: ${slot.roomId}`] : []),
      ...(slot.instructorId?.fullName ? [`Instructor: ${slot.instructorId.fullName}`] : []),
      `Term: ${term.academicYear} ${term.season}`,
    ].join('\n'),
    start: { dateTime: localInstant(dayString(first), slot.startTime, zone), timeZone: zone },
    end: { dateTime: localInstant(dayString(first), slot.endTime, zone), timeZone: zone },
    recurrence: [`RRULE:FREQ=WEEKLY;COUNT=${Math.floor((endDay - first) / (7 * DAY)) + 1}`],
  };
}

async function loadProcessedSchedule(student, now = new Date()) {
  if (student.studentType === 'Advising Student' && student.workflowStatus !== 'Processed') {
    throw google.fail('Your advising schedule must be processed before it can be synchronized.', 409);
  }
  const rows = await StudentSchedule.find({ studentId: student._id, status: 'Processed' })
    .populate({ path: 'slotId', populate: [
      { path: 'offeringId', populate: { path: 'courseId', select: 'code name' } },
      { path: 'instructorId', select: 'fullName' },
    ] }).lean();
  const terms = await AcademicTerm.find({ _id: { $in: [...new Set(rows.map((row) => String(row.termId)))] } }).lean();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const eligible = terms.filter((term) => dateOnly(term.teachingEndDate) >= today)
    .sort((a, b) => new Date(a.termStartDate) - new Date(b.termStartDate));
  const term = eligible.find((item) => dateOnly(item.termStartDate) <= today && dateOnly(item.termEndDate) >= today) || eligible[0];
  if (!term) throw google.fail('There is no current or upcoming processed schedule to synchronize.', 409);
  const selected = rows.filter((row) => String(row.termId) === String(term._id));
  if (selected.some((row) => !row.slotId || String(row.slotId.offeringId?.termId) !== String(term._id))) {
    throw google.fail('The processed schedule contains missing or inconsistent slots.', 422);
  }
  // Build and validate every event before making any external changes.
  const events = selected.map((row) => ({
    slot: row.slotId._id,
    slotData: {
      dayOfWeek: row.slotId.dayOfWeek,
      startTime: row.slotId.startTime,
      endTime: row.slotId.endTime,
    },
    body: buildRecurringEvent(row.slotId, term),
  }))
    .filter((event) => event.body);
  return { term, events };
}

const remoteId = (mapping) => `guc${google.hash(JSON.stringify([
  String(mapping.user), mapping.googleSubject, String(mapping.term), String(mapping.slot), mapping.generation,
]))}`;
const missing = (error) => [404, 410].includes(error.providerStatus);
const owned = (event, mapping) => event.extendedProperties?.private?.gucMapping === String(mapping._id);

async function synchronize(userId, student) {
  google.config();
  const schedule = await loadProcessedSchedule(student);
  const lockToken = crypto.randomUUID();
  const connection = await CalendarConnection.findOneAndUpdate({
    user: userId, needsReconnect: false,
    $or: [{ lockUntil: null }, { lockUntil: { $lte: new Date() } }],
  }, { $set: { lockToken, lockUntil: new Date(Date.now() + 120000) } }, { new: true }).select('+refreshToken');
  if (!connection) throw google.fail('Connect Google Calendar, or wait for your current synchronization to finish.', 409);
  const lock = { _id: connection._id, lockToken };
  const renew = async () => {
    const result = await CalendarConnection.updateOne(lock, { $set: { lockUntil: new Date(Date.now() + 120000) } });
    if (!result.matchedCount) throw google.fail('Synchronization was interrupted. Try again.', 409);
  };
  try {
    const token = await google.accessToken(google.decrypt(connection.refreshToken));
    const scope = { user: userId, googleSubject: connection.googleSubject, term: schedule.term._id };
    for (const item of schedule.events) {
      await renew();
      const mapping = await CalendarEvent.findOneAndUpdate({ ...scope, slot: item.slot }, {
        $setOnInsert: { ...scope, slot: item.slot, generation: 0 }, $set: { active: true },
      }, { upsert: true, new: true });
      let saved = false;
      for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
        const id = remoteId(mapping);
        const body = { ...item.body, extendedProperties: { private: { gucMapping: String(mapping._id) } } };
        let existing;
        try { existing = await google.eventRequest(token, 'GET', id); }
        catch (error) { if (!missing(error)) throw error; }
        if (existing && existing.status !== 'cancelled') {
          if (!owned(existing, mapping)) throw google.fail('Calendar event ownership could not be verified.', 409);
          await google.eventRequest(token, 'PATCH', id, body);
          saved = true;
        } else {
          try {
            await google.eventRequest(token, 'POST', '', { ...body, id });
            saved = true;
          } catch (error) {
            if (error.providerStatus !== 409) throw error;
            // A deleted Google event can retain its ID as a tombstone. Reserve
            // a new generation durably before creating its replacement.
            mapping.generation += 1;
            await mapping.save();
          }
        }
      }
      if (!saved) throw google.fail('Could not replace a deleted calendar event. Retry synchronization.');
    }
    const stale = await CalendarEvent.find({ ...scope, active: true, slot: { $nin: schedule.events.map((event) => event.slot) } });
    for (const mapping of stale) {
      await renew();
      try {
        const existing = await google.eventRequest(token, 'GET', remoteId(mapping));
        if (existing.status !== 'cancelled') {
          if (!owned(existing, mapping)) throw google.fail('Calendar event ownership could not be verified.', 409);
          await google.eventRequest(token, 'DELETE', remoteId(mapping));
        }
      } catch (error) { if (!missing(error)) throw error; }
      mapping.active = false;
      await mapping.save();
    }
    const syncedAt = new Date();
    await CalendarConnection.updateOne(lock, { $set: { lastSyncedAt: syncedAt } });
    return { count: schedule.events.length, removed: stale.length, term: `${schedule.term.academicYear} ${schedule.term.season}`, syncedAt };
  } catch (error) {
    if (error.needsReconnect) await CalendarConnection.updateOne(lock, { $set: { needsReconnect: true } });
    throw error;
  } finally {
    await CalendarConnection.updateOne(lock, { $set: { lockToken: null, lockUntil: null } });
  }
}
module.exports = { timezone, localInstant, buildRecurringEvent, loadProcessedSchedule, remoteId, synchronize };
