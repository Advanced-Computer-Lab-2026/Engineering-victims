const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const morgan = require("morgan");
const { ensureEnvFile, DEFAULT_MONGO_URI } = require("./config/ensureEnv");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const studentRoutes = require("./routes/studentRoutes");
const academicTermRoutes = require("./routes/academicTermRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const advisorRoutes = require("./routes/advisorRoutes");
const courseRoutes = require("./routes/courseRoutes");
const offeringRoutes = require("./routes/offeringRoutes");
const templateRoutes = require("./routes/templateRoutes");
const walletRoutes = require("./routes/walletRoutes");
const academicHistoryRoutes = require("./routes/academicHistoryRoutes");
const weeklyScheduleRoutes = require("./routes/weeklyScheduleRoutes");
const schedulingPreferenceRoutes = require("./routes/schedulingPreferenceRoutes");
const slotChangeRequestRoutes = require("./routes/slotChangeRequestRoutes");
const graduationPlanRoutes = require("./routes/graduationPlanRoutes");
const exitExamRequestRoutes = require("./routes/exitExamRequestRoutes");
const swapRequestRoutes = require("./routes/swapRequestRoutes");
const coordinatorDashboardRoutes = require("./routes/coordinatorDashboardRoutes");
const scheduleActivityRoutes = require("./routes/scheduleActivityRoutes");
const { seedIfEmpty } = require("./config/seedData");
const Notification = require("./models/Notification");
const NotificationEvent = require("./models/NotificationEvent");
const { startNotificationWorker } = require("./services/notificationEventService");
const { flushStudentNotifications } = require("./services/studentNotificationService");
const calendarRoutes = require("./routes/calendarRoutes");
const CalendarConnection = require("./models/CalendarConnection");
const CalendarOAuthState = require("./models/CalendarOAuthState");
const CalendarEvent = require("./models/CalendarEvent");
const SemesterStanding = require("./models/SemesterStanding");
const ProbationWarning = require("./models/ProbationWarning");
const SwapRequest = require("./models/SwapRequest");
const ScheduleActivityLog = require("./models/ScheduleActivityLog");
const { startProbationWorker } = require("./services/probationService");
const semesterStandingRoutes = require("./routes/semesterStandingRoutes");

// Create server/.env (and the MongoDB connection string) if it is missing.
if (ensureEnvFile()) {
  console.log("Created server/.env with a default local MongoDB connection.");
}

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/terms", academicTermRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/advisors", advisorRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/offerings", offeringRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/academic-history", academicHistoryRoutes);
app.use("/api/schedules", weeklyScheduleRoutes);
app.use("/api/preferences", schedulingPreferenceRoutes);
app.use("/api/slot-change-requests", slotChangeRequestRoutes);
app.use("/api/graduation-plans", graduationPlanRoutes);
app.use("/api/exit-exam-requests", exitExamRequestRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/semester-standings", semesterStandingRoutes);
app.use("/api/swaps", swapRequestRoutes);
app.use("/api/coordinator", coordinatorDashboardRoutes);
app.use("/api/schedule-history", scheduleActivityRoutes);
app.get("/", (req, res) => res.send("API running..."));

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_MONGO_URI;

if (!process.env.JWT_SECRET) {
  console.warn(
    "Warning: JWT_SECRET is not set. Sessions will not survive a restart.",
  );
}

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    const result = await seedIfEmpty();

    if (result.skipped) {
      // Restarting must never cost anyone their work, so an initialized
      // database is left exactly as it is.
      console.log(
        `Database already initialized (${result.users} users, ${result.students} students, ${result.courses} courses) — seed skipped.`,
      );
      console.log(
        "Run `node seed/seed.cjs` if you want a clean rebuild of the demo data.",
      );
    } else {
      const {
        users,
        students,
        courses,
        offerings,
        slots,
        groups,
        schedules,
        graduationPlans,
        notifications,
      } = result;
      console.log(
        `Seeded ${users} users, ${students} students, ${courses} courses and ${notifications} notifications`,
      );
      console.log(
        `Scheduling: ${offerings} offerings, ${slots} slots, ${groups} schedule groups, ${schedules} processed student schedules`,
      );
      console.log(`Graduation plans: ${graduationPlans}`);
    }

    // Duplicate prevention must be indexed before a worker can deliver events.
    await Promise.all([
      Notification.init(),
      NotificationEvent.init(),
      CalendarConnection.init(),
      CalendarOAuthState.init(),
      CalendarEvent.init(),
      SemesterStanding.init(),
      ProbationWarning.init(),
      SwapRequest.init(),
      ScheduleActivityLog.init(),
    ]);
    const stopNotificationWorker = startNotificationWorker({ beforeBatch: flushStudentNotifications });
    const stopProbationWorker = startProbationWorker();
    const httpServer = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    httpServer.on('close', stopNotificationWorker);
    httpServer.on('close', stopProbationWorker);
  } catch (err) {
    console.error("Startup error:", err.message);
    console.error(`\nCould not connect to MongoDB at: ${MONGODB_URI}`);
    console.error(
      "Check that MongoDB is running, or set MONGODB_URI in server/.env",
    );
    process.exit(1);
  }
}

startServer();
