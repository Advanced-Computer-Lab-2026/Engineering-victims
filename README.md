<!--
  ╔══════════════════════════════════════════════════════════════════╗
  ║  University Schedule Management System — README                  ║
  ║  Course: CSEN 704 / DMET 706 — Advanced Computer Lab (Winter 26) ║
  ║  Stack: MERN (MongoDB, Express, React, Node.js)                  ║
  ╚══════════════════════════════════════════════════════════════════╝
  NOTE FOR AI TOOLS:
  This repository is a full-stack MERN application built as a course
  project. Requirements live in `docs/requirements.xlsx`. Sprint plan,
  architecture, and API contracts are documented in `/docs`. The team
  follows Scrum; see `/REPORTS` branch for weekly reports.
-->

<h1 align="center">🎓 University Schedule Management System</h1>

<p align="center">
  <em>A full-stack MERN platform for managing student schedules, advising workflows, and course offerings at the German University in Cairo.</em>
</p>

<p align="center">
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=mongodb,express,react,nodejs,vite,ts,js,html,css,tailwind,bootstrap,styledcomponents,git,github,postman,vscode,npm" />
  </a>
</p>

<p align="center">
  <img alt="Build" src="https://img.shields.io/badge/build-passing-brightgreen?style=for-the-badge" />
  <img alt="Sprint" src="https://img.shields.io/badge/sprint-1%20%7C%202%20%7C%203-blueviolet?style=for-the-badge" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" />
  <img alt="Status" src="https://img.shields.io/badge/status-in%20development-yellow?style=for-the-badge" />
</p>

---

## 📖 Table of Contents

- [Motivation](#-motivation)
- [Build Status](#-build-status)
- [Screenshots](#-screenshots)
- [Tech Stack & Frameworks](#-tech-stack--frameworks)
- [Features](#-features)
- [Project Structure](#-project-structure)
- [Code Style](#-code-style)
- [Code Examples](#-code-examples)
- [Installation](#-installation)
- [Environment Variables](#-environment-variables)
- [API Reference](#-api-reference)
- [Tests](#-tests)
- [Scrum & Team](#-scrum--team)
- [Contribute](#-contribute)
- [Credits](#-credits)
- [License](#-license)

---

## 🎯 Motivation

The German University in Cairo (GUC) manages course registration, advising, and scheduling across multiple faculties and majors. Today, these workflows are scattered across spreadsheets, email threads, and manual advisor effort — making them error-prone, hard to audit, and slow to resolve.

This project delivers a **centralized University Schedule Management System** that:

- Gives **students** a clear weekly schedule, swap options, and self-service tools.
- Empowers **advisors** to build and validate advising schedules faster.
- Provides **coordinators and administrators** real-time visibility into every student's workflow state, requests, and financial records.
- Enforces **academic rules automatically** (prerequisites, credit-hour limits, probation allowances, deadlines).

The system is built as part of the **CSEN 704 / DMET 706 Advanced Computer Lab** course, following Agile/Scrum over three sprints.

---

## 🚧 Build Status

> ⚠️ **This project is under active development.** It is not yet feature-complete. Below is the honest status of each area — no project is perfect, and this section is intentionally candid.

| Module | Status | Notes |
|---|---|---|
| 🔐 Authentication & Profiles | ✅ Complete | Login, logout, password reset, profile view, notifications |
| 🗂️ Course Catalogue & Terms | ✅ Complete | CRUD, CSV import, academic term dates |
| 📚 Course Offerings & Slots | 🟡 In Progress | Create/update/delete working; publish toggle pending |
| 🧩 Standard Schedule Templates | 🟡 In Progress | Template CRUD done; group assignment in testing |
| 🗓️ Student Schedule Views | 🟡 In Progress | Weekly calendar renders; PDF download pending |
| 🔁 Whole-Schedule Swap | 🔴 Not Started | Sprint 2 scope |
| 🧑‍🏫 Advising Draft Workflow | 🔴 Not Started | Sprint 2 scope |
| 🔄 Slot-Change Requests | 🔴 Not Started | Sprint 2 scope |
| 💸 Extra Hours & Payments | 🔴 Not Started | Sprint 2 scope |
| 🎓 Graduation & Exit Exams | 🔴 Not Started | Sprint 2 scope |
| 🔔 Notifications & Calendar Sync | 🔴 Not Started | Sprint 2 scope |
| 📊 Dashboards & Audit History | 🔴 Not Started | Sprint 2 scope |
| 🎨 UI/UX Polish | 🟡 In Progress | Ongoing per sprint |
| 📱 Mobile Responsiveness | 🟡 In Progress | Partial — some tables overflow on small screens |

**Known Issues:**
- Race conditions under rapid concurrent seat assignment are guarded by transactions but not yet stress-tested.
- Sandbox payment gateway occasionally times out — retry flow (Req 93) mitigates this.
- Calendar OAuth tokens are stored but not refreshed automatically yet.

---

## 📸 Screenshots

> Add at least **5 screenshots** here before Sprint 2 evaluation.

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

## 🛠️ Tech Stack & Frameworks

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
- ✅ **Joi / express-validator** — request validation

### Database
- 🍃 **MongoDB** — document store
- 🧭 **Mongoose** — ODM, schemas, transactions

### Dev & DevOps
- 🐙 **Git + GitHub** — version control, PRs, protected `main`
- 🧪 **Postman** — API testing collection
- 🧪 **Jest + Supertest** — unit & integration tests
- 💻 **VS Code** — editor

---

## ✨ Features

> Full feature list with requirement IDs is in [`docs/requirements.xlsx`](./docs/requirements.xlsx). Below is the human-readable summary.

### 🔐 Authentication & Users
- GUC email + password login (no sign-up)
- Role-based access: Normal Student, Advising Student, Advisor, Coordinator, Administrator
- One-time password reset via GUC email
- Profile view scoped to role
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

### 📅 Integrations
- Third-party calendar sync via OAuth (Google / Outlook)
- Email notifications (GUC inbox)

---

## 🗂️ Project Structure

```text
university-schedule-management/
├── client/                    # React + Vite frontend (TypeScript)
│   ├── public/
│   └── src/
│       ├── api/               # Axios wrappers per resource
│       ├── components/        # Reusable UI components
│       ├── contexts/          # Auth, Notification contexts
│       ├── hooks/             # Custom React hooks
│       ├── pages/             # Route-level pages
│       ├── styles/            # Tailwind + styled-components
│       ├── types/             # Shared TS types
│       └── main.tsx
├── server/                    # Express + Node backend
│   ├── config/                # DB, env, constants
│   ├── controllers/           # Route handlers
│   ├── middleware/            # Auth, RBAC, validation, errors
│   ├── models/                # Mongoose schemas
│   ├── routes/                # Express routers
│   ├── services/              # Business logic
│   ├── utils/                 # Helpers
│   └── server.js
├── seed/                      # MongoDB seed scripts
├── postman/                   # Postman collection + env
├── docs/                      # Requirements, diagrams, screenshots
├── tests/                     # Jest + Supertest
├── .env.example
├── package.json
└── README.md
