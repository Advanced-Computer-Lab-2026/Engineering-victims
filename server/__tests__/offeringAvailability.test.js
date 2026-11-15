jest.mock('../models/CourseOffering', () => ({
  find: jest.fn(),
  findById: jest.fn(),
}));
jest.mock('../models/CourseSlot', () => ({ find: jest.fn() }));
jest.mock('../models/StudentSchedule', () => ({ aggregate: jest.fn() }));

const CourseOffering = require('../models/CourseOffering');
const CourseSlot = require('../models/CourseSlot');
const StudentSchedule = require('../models/StudentSchedule');
const controller = require('../controllers/offeringController');

const response = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('course offering availability access', () => {
  test('limits Advisor offering listings to published courses', async () => {
    const offerings = [];
    CourseOffering.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(offerings),
    });

    const res = response();
    await controller.getOfferings(
      { query: { termId: 'term-1' }, user: { role: 'Advisor' } },
      res,
    );

    expect(CourseOffering.find).toHaveBeenCalledWith({
      termId: 'term-1',
      publicationStatus: 'Published',
    });
    expect(res.statusCode).toBe(200);
  });

  test('does not disclose draft offering details to Advisors', async () => {
    const offering = {
      _id: 'offering-1',
      publicationStatus: 'Draft',
      courseId: null,
      termId: null,
    };
    CourseOffering.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(offering),
    });

    const res = response();
    await controller.getOfferingDetails(
      { params: { id: 'offering-1' }, user: { role: 'Advisor' } },
      res,
    );

    expect(res.statusCode).toBe(404);
    expect(CourseSlot.find).not.toHaveBeenCalled();
    expect(StudentSchedule.aggregate).not.toHaveBeenCalled();
  });
});
