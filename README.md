<h1 align="center">🎓 University Schedule Management System</h1>

<p align="center">
  <em>A full-stack MERN platform for managing university schedules, advising workflows, course offerings, and academic finances.</em>
</p>

<p align="center">
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=mongodb,express,react,nodejs,vite,ts,js,html,css,tailwind,bootstrap,styledcomponents,git,github,postman,vscode,npm" />
  </a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" />
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.0-blueviolet?style=for-the-badge" />
  <img alt="PRs" src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=for-the-badge" />
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white" />
</p>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Motivation](#-motivation)
- [Screenshots](#-screenshots)
- [Tech Stack](#-tech-stack)
- [Features](#-features)
- [Project Structure](#-project-structure)
- [Code Style](#-code-style)
- [Code Examples](#-code-examples)
- [Installation](#-installation)
- [Environment Variables](#-environment-variables)
- [API Reference](#-api-reference)
- [Tests](#-tests)
- [Roadmap](#-roadmap)
- [Contribute](#-contribute)
- [Credits](#-credits)
- [License](#-license)

---

## 🌍 Overview

The **University Schedule Management System** is a full-stack web application that centralizes how universities handle course registration, academic advising, schedule building, and student finances.

It replaces the fragmented mix of spreadsheets, email threads, and manual advisor effort with a single platform that enforces academic rules automatically — prerequisites, credit-hour limits, probation allowances, seat capacity, timetable clashes, and deadlines.

### Who it's for

| Role | What they get |
|---|---|
| 🎓 **Student** | Weekly schedule, course swaps, slot-change requests, wallet, payments |
| 🧑‍🏫 **Advisor** | Draft schedule builder, validation engine, graduation planning |
| 🗂️ **Coordinator** | Review queues, approval workflows, financial oversight |
| 🛡️ **Administrator** | Course catalogue, offerings, terms, user management |

---

## 🎯 Motivation

Universities manage thousands of students across multiple faculties, majors, and semesters. Registration, advising, and scheduling are typically spread across disconnected tools — causing mistakes, delays, and endless back-and-forth between students and advisors.

This project solves that by providing:

- **A single source of truth** for courses, offerings, and schedules
- **Automated enforcement** of academic rules and deadlines
- **Role-aware workflows** for students, advisors, coordinators, and admins
- **Full auditability** of every scheduling action
- **Integrated finance** for extra hours, payments, and refunds

The result is faster advising, fewer errors, and complete visibility for everyone involved.

---

## 📸 Screenshots

| Login | Weekly Schedule |
|---|---|
| ![Login](./docs/screenshots/login.png) | ![Schedule](./docs/screenshots/schedule.png) |

| Course Catalogue | Advising Draft |
|---|---|
| ![Catalogue](./docs/screenshots/catalogue.png) | ![Advising](./docs/screenshots/advising.png) |

| Coordinator Dashboard |
|---|
| ![Dashboard](./docs/screenshots/dashboard.png) |

> 📹 A short screen recording of the full flow is available at [`./docs/demo.mp4`](./docs/demo.mp4).

---

## 🛠️ Tech Stack

<p align="left">
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=mongodb,express,react,nodejs,vite,ts,js,html,css,tailwind,bootstrap,styledcomponents,git,github,postman,vscode" />
  </a>
</p>

### Frontend
- ⚛️ **React** — component-based UI
- ⚡ **Vite** — fast dev server & bundler
- 🟦 **TypeScript** — type safety across the client
- 🎨 **Tailwind CSS** — utility-first styling
- 🅱️ **Bootstrap** — grid & responsive helpers
- 💅 **styled-components** — scoped component styling
- 🌐 **HTML5 + CSS3** — semantic markup, custom theming

### Backend
- 🟢 **Node.js** — runtime
- 🚂 **Express.js** — REST API
- 🔐 **JWT + bcrypt** — authentication & password hashing
- ✅ **Zod / express-validator** — request validation

### Database
- 🍃 **MongoDB** — document store
- 🧭 **Mongoose** — ODM, schemas, transactions

### Tooling
- 🐙 **Git + GitHub** — version control, PRs, protected `main`
- 🧪 **Postman** — API testing collection
- 🧪 **Jest + Supertest** — unit & integration tests
- 💻 **VS Code** — editor

---

## ✨ Features

### 🔐 Authentication & Users
- GUC email + password login (no sign-up)
- Role-based access control (Student, Advisor, Coordinator, Administrator)
- One-time password reset via email
- Role-scoped profile views
- In-app notifications with mark-as-read

### 🗂️ Academic Administration
- Course catalogue CRUD (code, name, credits, type, faculty/major, prerequisites)
- CSV bulk import with row-level validation and atomic rollback
- Academic term creation with registration/advising deadlines
- Course offerings with lecture/tutorial/lab slot groups
- Offering duplication across terms
- Publish/unpublish offerings
- Standard schedule template creation per major/semester/group

### 🗓️ Scheduling
- Weekly calendar view (course code, name, slots, rooms, instructors)
- Registered courses with credit hours
- Slot details per course
- PDF download/print of processed schedule
- Eligible whole-schedule swap groups
- Swap request submission, completion, withdrawal, expiry
- Slot-change requests with advisor/coordinator approval

### 🧑‍🏫 Advising Workflow
- Advisor assignment and reassignment
- Draft schedule creation with preferences
- Mandatory course selection & removal requests
- Validation engine (prerequisites, clashes, capacity, credit limits)
- Ready for Review → Process → Reopen lifecycle
- Graduation plan builder with prerequisite ordering
- Exit exam request flow

### 💸 Financial
- Wallet balance and transaction history
- Extra-hours request → approval → settlement
- Pay now (wallet or sandbox gateway) or defer to installment
- Refund and cancellation flow
- Financial records list, search, filter, export

### 📊 Reporting & Audit
- Coordinator pending-work dashboard
- Schedule activity history (auto-recorded)
- Search, filter, export audit logs
- Notifications for every workflow event

### 👥 Student Directory (Coordinator / Administrator)
- Every GUC student with their workflow status, blocking step and last update
- Search by student ID, full name or GUC email
- Filter by type, advisor, major, semester, standing, status, blocking step, account
- Open one student's full details from the results
- Administrator can activate or deactivate an account

### 📅 Integrations
- Third-party calendar sync via OAuth (Google / Outlook)
- Email notifications

---

## 🗂️ Project Structure

```text
university-schedule-management/
├── src/                        # React + Vite frontend (TypeScript)
│   ├── components/
│   │   ├── ui/                 # Card, Badge, Select, Button, Input, Alert, ...
│   │   ├── AppLayout.tsx       # Sidebar + content shell
│   │   ├── RouteGuards.tsx     # Auth and role guards
│   │   └── Sidebar.tsx
│   ├── hooks/                  # useSession (shared, cached)
│   ├── lib/                    # api.ts (fetch wrapper), types, services
│   ├── pages/                  # Route-level pages
│   ├── index.css               # Inter @font-face, .app-gradient
│   └── main.tsx                # Routes
├── server/                     # Express + Node backend
│   ├── config/                 # env bootstrap, seed data
│   ├── controllers/            # Route handlers
│   ├── middleware/             # Auth + role guards
│   ├── models/                 # Mongoose schemas
│   ├── routes/                 # Express routers
│   ├── services/               # Query building, workflow status
│   └── server.js
├── seed/                       # MongoDB seed scripts
├── scripts/                    # setup-env.mjs
├── postman/                    # Postman collection + env
├── docs/                       # Diagrams, screenshots, docs
├── tests/                      # Jest + Supertest
├── .env.example
├── package.json
└── README.md
```

## 🚀 Installation

```bash
# 1. Install dependencies for the frontend and the backend
npm install
npm install --prefix server

# 2. Create any missing env files (.env and server/.env).
#    This also generates a JWT secret and a local MongoDB connection string.
npm run setup
```

`npm run setup` never overwrites existing files. To point at MongoDB Atlas instead
of a local database, edit `MONGODB_URI` in `server/.env`.

## ▶️ Running the app

The client and server are two separate processes:

```bash
# Run 1 - API server (http://localhost:5000 by default)
npm run dev:server

# Run 2 - Vite dev server (http://localhost:5173)
npm run dev:client
```

Or start both at once with prefixed logs:

```bash
npm run dev
```

By default the Vite dev server proxies `/api/*` to `VITE_API_PROXY_TARGET`, so the
app calls relative URLs in development and there is no CORS setup to maintain.
Keep that value in sync with `PORT` in `server/.env`.

If the two processes are on **different machines** — the client under WSL and the
API on Windows, for example — the proxy cannot be used, because WSL has no route
to the Windows host. Set an absolute `VITE_API_URL` instead and the browser
talks to the API directly; the server already sends permissive CORS headers:

```bash
# .env
VITE_API_URL=http://localhost:8000
```

Seeded logins (the database is re-seeded on every server start):

| Role | Email | Password |
| --- | --- | --- |
| Student | `samy.elgedaily@student.guc.edu.eg` | `SamySamy2006` |
| Advisor | `advisor@guc.edu.eg` | `password123` |
| Coordinator | `coordinator@guc.edu.eg` | `password123` |
| Administrator | `admin@guc.edu.eg` | `password123` |

The seed also creates 12 students spanning both student types, every workflow
status, both account states and both academic standings, so the students list,
search, filters and the activate/deactivate action can all be exercised without
adding data by hand.

### Troubleshooting

**`ECONNREFUSED 127.0.0.1:27017` from WSL** — MongoDB is installed on Windows and
binds to Windows' loopback, which WSL cannot reach unless mirrored networking is
enabled. Either enable it in `%UserProfile%\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
```

then run `wsl --shutdown` from PowerShell, or start the server with the Windows
Node binary (`node.exe server.js`) so it shares Windows' network stack.

**`http proxy error: /api/... connect ECONNREFUSED 127.0.0.1:8000`** — the dev
server is proxying to an API it cannot route to. This is the same WSL-to-Windows
networking gap as above. Set `VITE_API_URL` in `.env` to the API's absolute URL so
the browser calls it directly instead of through the proxy.

## 🔐 Environment Variables

`server/.env`

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `5000` | Port the API listens on |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/university_schedule` | Local DB or Atlas `mongodb+srv://` URI |
| `JWT_SECRET` | generated | Secret used to sign session tokens |
| `NODE_ENV` | `development` | Runtime mode |

`.env` (client)

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_PROXY_TARGET` | `http://localhost:5000` | Dev-only proxy target for `/api` |
| `VITE_API_URL` | empty | Absolute backend URL for production builds |
| `CLIENT_PORT` | `5173` | Port for the Vite dev server |

