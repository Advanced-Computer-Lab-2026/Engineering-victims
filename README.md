<h1 align="center">University Schedule Management System</h1>

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

## Table of Contents

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

## Overview

The **University Schedule Management System** is a full-stack web application that centralizes how universities handle course registration, academic advising, schedule building, and student finances.

It replaces the fragmented mix of spreadsheets, email threads, and manual advisor effort with a single platform that enforces academic rules automatically — prerequisites, credit-hour limits, probation allowances, seat capacity, timetable clashes, and deadlines.

### Who it's for

| Role | What they get |
|---|---|
| **Student** | Weekly schedule, course swaps, slot-change requests, wallet, payments |
| **Advisor** | Assigned-student roster ("My Students"), draft schedule builder, validation engine, graduation planning |
| **Coordinator** | Review queues, approval workflows, financial oversight |
| **Administrator** | Course catalogue, offerings, terms, user management |

---

## Motivation

Universities manage thousands of students across multiple faculties, majors, and semesters. Registration, advising, and scheduling are typically spread across disconnected tools — causing mistakes, delays, and endless back-and-forth between students and advisors.

This project solves that by providing:

- **A single source of truth** for courses, offerings, and schedules
- **Automated enforcement** of academic rules and deadlines
- **Role-aware workflows** for students, advisors, coordinators, and admins
- **Full auditability** of every scheduling action
- **Integrated finance** for extra hours, payments, and refunds

The result is faster advising, fewer errors, and complete visibility for everyone involved.

---

## Screenshots

| Login | Weekly Schedule |
|---|---|
| ![Login](./docs/screenshots/login.png) | ![Schedule](./docs/screenshots/schedule.png) |

| Course Catalogue | Advising Draft |
|---|---|
| ![Catalogue](./docs/screenshots/catalogue.png) | ![Advising](./docs/screenshots/advising.png) |

| Coordinator Dashboard |
|---|
| ![Dashboard](./docs/screenshots/dashboard.png) |

> A short screen recording of the full flow is available at [`./docs/demo.mp4`](./docs/demo.mp4).

---

## Tech Stack

<p align="left">
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=mongodb,express,react,nodejs,vite,ts,js,html,css,tailwind,bootstrap,styledcomponents,git,github,postman,vscode" />
  </a>
</p>

### Frontend
- **React** — component-based UI
- **Vite** — fast dev server & bundler
- **TypeScript** — type safety across the client
- **Tailwind CSS** — utility-first styling
- **Bootstrap** — grid & responsive helpers
- **styled-components** — scoped component styling
- **HTML5 + CSS3** — semantic markup, custom theming

### Backend
- **Node.js** — runtime
- **Express.js** — REST API
- **JWT + bcrypt** — authentication & password hashing
- **Zod / express-validator** — request validation

### Database
- **MongoDB** — document store
- **Mongoose** — ODM, schemas, transactions

### Tooling
- **Git + GitHub** — version control, PRs, protected `main`
- **Postman** — API testing collection
- **Jest + Supertest** — unit & integration tests
- **VS Code** — editor

---

## Features

### Authentication & Users
- GUC email + password login (no sign-up)
- Role-based access control (Student, Advisor, Coordinator, Administrator)
- One-time password reset via email
- Role-scoped profile views
- In-app notifications with mark-as-read

### Academic Administration
- Course catalogue CRUD (code, name, credits, type, faculty/major, prerequisites)
- CSV bulk import with row-level validation and atomic rollback
- Academic term creation with registration/advising deadlines
- Course offerings with lecture/tutorial/lab slot groups
- Offering duplication across terms
- Publish/unpublish offerings
- Standard schedule template creation per major/semester/group

### Scheduling
- Weekly calendar view (course code, name, slots, rooms, instructors)
- Registered courses with credit hours
- Slot details per course
- PDF download/print of processed schedule
- Eligible whole-schedule swap groups
- Swap request submission, completion, withdrawal, expiry
- Slot-change requests with advisor/coordinator approval

### Advising Workflow
- Advisor assignment and reassignment
- Draft schedule creation with preferences
- Mandatory course selection & removal requests
- Validation engine (prerequisites, clashes, capacity, credit limits)
- Ready for Review → Process → Reopen lifecycle
- Graduation plan builder with prerequisite ordering
- Exit exam request flow

### Financial
- Wallet balance and transaction history
- Extra-hours request → approval → settlement
- Pay now (wallet or sandbox gateway) or defer to installment
- Refund and cancellation flow
- Financial records list, search, filter, export

### Reporting & Audit
- Coordinator pending-work dashboard
- Schedule activity history (auto-recorded)
- Search, filter, export audit logs
- Notifications for every workflow event

### Student Directory (Coordinator / Administrator / Advisor)
- Every GUC student with their workflow status, blocking step and last update
- Search by student ID, full name or GUC email
- Filter by type, advisor, major, semester, standing, status, blocking step, account
- Open one student's full details from the results
- Administrator can activate or deactivate an account
- An Advisor gets the same list, drawer and filters, but scoped server-side to
  the students assigned to them — the scope is applied after the query is
  built, so `?assignedAdvisor=` cannot widen it, and the detail route rejects
  any student who is not assigned to the signed-in advisor. Advisor assignment,
  directory statistics and the advisor dropdown stay Coordinator/Administrator
  only.

### Integrations
- Third-party calendar sync via OAuth (Google / Outlook)
- Email notifications over Gmail SMTP (reset codes, password changes, advisor add/remove)

---

## Project Structure

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

## Installation

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

## Running the app

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

### Database seeding

The server seeds **only when the database is empty**. A first run against a
fresh database populates it; every run after that is left exactly as it is, so
restarting the server — or saving a file, which makes `nodemon` restart it —
never destroys data.

To wipe and rebuild the demo data on purpose:

```bash
node seed/seed.cjs
```

The same rebuild is reachable by an Administrator at `GET /api/auth/seed`.

To confirm both halves of that against a throwaway database — a fresh one gets
seeded, a populated one is left alone, and the wipe route stays shut for
everyone else — run:

```bash
node scripts/verify-seed-guard.cjs
```

Seeded logins:

| Role | Email | Password | Why this account exists |
| --- | --- | --- | --- |
| Advisor | `mona.adel@guc.edu.eg` | `password123` | Holds advising students |
| Advisor | `karim.fahmy@guc.edu.eg` | `password123` | Holds advising students |
| Advisor | `advisor@guc.edu.eg` | `password123` | Holds advising students |
| Advisor | `hind.rashwan@guc.edu.eg` | `password123` | **No** assigned students, so *Remove advisor* can succeed |
| Coordinator | `coordinator@guc.edu.eg` | `password123` | Primary coordinator |
| Coordinator | `rania.hosny@guc.edu.eg` | `password123` | Spare account, so *Add advisor* has something to promote without destroying a demo login |
| Administrator | `admin@guc.edu.eg` | `password123` | Full access, and the `createdBy` on every term and course |

Every student in the directory also gets a login account — passwords follow
`FirstnameLastname2006`:

| Student type | Email | Password |
| --- | --- | --- |
| Normal | `samy.elgedaily@student.guc.edu.eg` | `SamyElgedaily2006` |
| Normal | `mariam.fouad@student.guc.edu.eg` | `MariamFouad2006` |
| Normal | `zeyad.tarek@student.guc.edu.eg` | `ZeyadTarek2006` |
| Normal | `farida.wagdy@student.guc.edu.eg` | `FaridaWagdy2006` |
| Normal | `youssef.kamal@student.guc.edu.eg` | `YoussefKamal2006` |
| Advising | `laila.hassan@student.guc.edu.eg` | `LailaHassan2006` |
| Advising | `omar.nabil@student.guc.edu.eg` | `OmarNabil2006` |
| Advising | `salma.ibrahim@student.guc.edu.eg` | `SalmaIbrahim2006` |
| Advising | `rana.adel@student.guc.edu.eg` | `RanaAdel2006` |
| Advising | `ahmed.sherif@student.guc.edu.eg` | `AhmedSherif2006` |
| Advising | `hana.mahmoud@student.guc.edu.eg` | `HanaMahmoud2006` |
| Advising | `mariam.said@student.guc.edu.eg` | `MariamSaid2006` |
| Advising | `tamer.lotfy@student.guc.edu.eg` | `TamerLotfy2006` |
| Advising | `karim.emad@student.guc.edu.eg` | `KarimEmad2006` |
| Advising | `nour.elsayed@student.guc.edu.eg` | `NourElsayed2006` |
| Advising | `dina.mostafa@student.guc.edu.eg` | `DinaMostafa2006` |
| Advising | `hassan.rifaat@student.guc.edu.eg` | `HassanRifaat2006` |
| Advising | `yasmin.adly@student.guc.edu.eg` | `YasminAdly2006` |

`youssef.kamal@student.guc.edu.eg` is seeded deactivated in **both** the
directory and the login record, so his login is rejected with "account is
currently inactive" — useful for exercising that path.

### What the seed guarantees

The dataset is built so that no screen, filter or action is decorative:

- **18 students** cover all 15 workflow statuses (every status the filter offers
  matches at least one row), all 3 academic standings including `Dismissed`,
  both student types, both account states, all 8 semesters, and both majors the
  catalogue actually serves.
- **Every student has a login account** with the same email and the same
  `isActive` flag, so the profile join never falls back to "Not set" and a
  deactivated student really cannot sign in.
- **Two advising students have no advisor**, so first-time assignment and the
  *Unassigned* filter have a target; the rest are spread over three advisors so
  reassignment and the advisor filter have options. One advisor deliberately has
  none, because *Remove advisor* refuses to run while students are assigned.
- **3 terms** (one closed, the current one, one ahead), each with **course
  offerings** — 25 in total, a mix of `Published` and `Draft` — and **54
  lecture/tutorial/lab slots** laid out on a grid that cannot trip the
  instructor or room conflict rules. No term is left empty: the catalogue only
  offers Winter and Spring courses, so a Summer term could never hold an
  offering and is deliberately not seeded.
- **75 courses** with prerequisites linked by id (no dangling codes, no cycles),
  so the prerequisite picker and the *Required by* panel both have content.
- **81 notifications**, written *from* the state above rather than from a fixed
  script: a student's notifications match their workflow status, an inactive
  student is not told they can sign in, an advisor's message names their actual
  students, and the Coordinator/Administrator counts are computed off the
  records. Every account has at least one unread and one read row, so both
  *mark as read* and *mark all as read* work everywhere.

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

## Environment Variables

`server/.env`

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `5000` | Port the API listens on |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/university_schedule` | Local DB or Atlas `mongodb+srv://` URI |
| `JWT_SECRET` | generated | Secret used to sign session tokens |
| `NODE_ENV` | `development` | Runtime mode |
| `MAIL_USER` | `engineeringvictims1@gmail.com` | Gmail address that sends outbound email |
| `MAIL_PASS` | — | 16-char Gmail **App Password** (not the account password). Blank disables email |

`.env` (client)

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_PROXY_TARGET` | `http://localhost:5000` | Dev-only proxy target for `/api` |
| `VITE_API_URL` | empty | Absolute backend URL for production builds |
| `CLIENT_PORT` | `5173` | Port for the Vite dev server |

