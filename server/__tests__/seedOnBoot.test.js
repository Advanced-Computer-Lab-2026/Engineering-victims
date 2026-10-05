/**
 * Boot-time seeding: an initialized database must be left alone.
 *
 * Only the three models isSeeded() counts are mocked, so no MongoDB is needed.
 * The destructive seed() path is deliberately never exercised here — it has no
 * assertions left to make once it is proven that the server does not reach it.
 */
jest.mock('../models/User', () => ({ countDocuments: jest.fn() }));
jest.mock('../models/Student', () => ({ countDocuments: jest.fn() }));
jest.mock('../models/Course', () => ({ countDocuments: jest.fn() }));

const User = require('../models/User');
const Student = require('../models/Student');
const Course = require('../models/Course');
const { isSeeded, seedIfEmpty } = require('../config/seedData');

/** Counts as the database reports them for one run of the check. */
const countsTo = ({ users, students, courses }) => {
  User.countDocuments.mockResolvedValue(users);
  Student.countDocuments.mockResolvedValue(students);
  Course.countDocuments.mockResolvedValue(courses);
};

beforeEach(() => jest.clearAllMocks());

describe('isSeeded', () => {
  it('reports a fully populated database as seeded', async () => {
    countsTo({ users: 25, students: 18, courses: 75 });

    await expect(isSeeded()).resolves.toEqual({
      seeded: true,
      users: 25,
      students: 18,
      courses: 75,
    });
  });

  it('reports a never-used database as unseeded', async () => {
    countsTo({ users: 0, students: 0, courses: 0 });

    const result = await isSeeded();
    expect(result.seeded).toBe(false);
  });

  // The failure this guards against: a seed that died between creating users
  // and creating students. A single-collection check would call that
  // "initialized" and freeze a broken half-populated database forever.
  it('reports a half-finished seed as unseeded so the next boot repairs it', async () => {
    countsTo({ users: 25, students: 0, courses: 0 });

    const result = await isSeeded();
    expect(result.seeded).toBe(false);
    expect(result.users).toBe(25);
  });

  it('treats any missing core collection as unseeded', async () => {
    countsTo({ users: 25, students: 18, courses: 0 });

    const result = await isSeeded();
    expect(result.seeded).toBe(false);
  });

  it('asks all three collections in one pass', async () => {
    countsTo({ users: 1, students: 1, courses: 1 });

    await isSeeded();

    expect(User.countDocuments).toHaveBeenCalledTimes(1);
    expect(Student.countDocuments).toHaveBeenCalledTimes(1);
    expect(Course.countDocuments).toHaveBeenCalledTimes(1);
  });
});

describe('seedIfEmpty', () => {
  // This is the restart case the whole change exists for. With no database
  // connection open, any attempt to wipe would hang or throw — so returning
  // cleanly is itself the proof that nothing destructive happened.
  it('returns without touching the database when one is already initialized', async () => {
    countsTo({ users: 25, students: 18, courses: 75 });

    await expect(seedIfEmpty()).resolves.toEqual({
      skipped: true,
      users: 25,
      students: 18,
      courses: 75,
    });
  });
});
