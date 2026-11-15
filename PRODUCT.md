# PRODUCT.md — PROJECT FILE

**Status:** project-owned and editable. Filled from the repository README and
the routes in `src/main.tsx`; no invented product facts.
**System contract:** [`ui-system/AGENTS.md`](ui-system/AGENTS.md) · [`ui-system/docs/design-brief.md`](ui-system/docs/design-brief.md)

---

## 1. Project facts

| Field | Value |
| --- | --- |
| Product | University Schedule Management System — a single platform for course registration, academic advising, schedule building, and student finances. |
| Primary users | GUC students (Normal and Advising), Advisors, Coordinators, and Administrators. Accounts are created by a Coordinator; there is no sign-up. |
| Primary job | Build, review, and act on a valid university schedule without spreadsheets or email threads. |
| Secondary jobs | Register for courses, request slot changes and whole-schedule swaps, review graduation plans, manage advising rosters, track wallet and payments, audit scheduling actions. |
| Success signal | A student can see a conflict-free weekly schedule and the staff member responsible can approve or act on it in the same system. |
| Constraints | Existing MERN stack; role-based access enforced by the API; dark interface; academic rules (prerequisites, credit limits, probation, capacity, clashes, deadlines) must stay authoritative. |
| Stack | React 18 + TypeScript + Vite + Tailwind CSS; Express + MongoDB backend. |
| Brand file | `brand.css` |
| Token source | [`ui-system/tokens.css`](ui-system/tokens.css) |
| Typeface | Public Sans (400/500/600/700) |
| Icon set | Lucide (24px grid, 2px stroke) |
| Brand source color | `#4F46E5` (indigo) |
| Breakpoints | 360 / 768 / 1024 / 1200 / 1440 |
| Target browsers | Last 2 versions of Chrome, Safari, Firefox, Edge |
| Non-goals | New product capabilities in this UI phase; changing API contracts, workflow rules, or data models; light theme or theme toggle. |

---

## 2. Design direction

- **Calm:** dense academic data is presented with quiet surfaces, one indigo
  action color, and generous spacing rather than decoration.
- **Legible:** the next action and the current workflow state are always
  obvious, including in tables and on mobile.
- **Accountable:** destructive and irreversible actions explain consequences
  and never rely on browser dialogs.

**Brand owns:** one indigo family, neutral tinted surfaces, status colors used
only for status.
**Brand rejects:** gradient surfaces, rainbow accents used for decoration,
emoji as UI, nested cards, light theme for this release.

---

## 3. Journey

| Stage | User goal | Questions | Actions | Pain points | Opportunity | Screen |
| --- | --- | --- | --- | --- | --- | --- |
| Sign in | Reach the right workspace | Which account am I using? | Enter GUC email and password | Wrong domain, forgotten password | Clear domain rule, specific errors, password recovery | `/` |
| Orientation | Know what I can do | Where am I, what is available to me? | Scan role-aware destinations | Sidebar hides role differences | Dashboard lists only permitted destinations | `/dashboard` |
| Core task | Complete the role's main job | What needs action, what is blocked? | Review queues, build schedules, register courses | Dense tables, unclear state | One primary action per view, explicit status | role routes |
| Exception | Recover from a problem | What failed, what do I do next? | Retry, clear filters, contact owner | Generic error copy | Specific inline errors with recovery | all |
| Exit | Leave safely | Is my work saved? | Sign out | Lost drafts | Session-expiry handling keeps context | any |

Every screen must answer: where am I, what can I do here, what happens next.

---

## 4. Screen inventory

| Route | User job | Primary action | Data | Auth | Loading | Empty | Error | Success |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | Sign in | Sign in | Session | No | Button loading | n/a | Inline banner | Redirect |
| `/forgot-password`, `/reset-password` | Recover access | Send / set password | Token, password | No | Button loading | n/a | Field + banner | Confirmation |
| `/dashboard` | Orient | Open a permitted destination | Role-aware nav, stats | Yes | Cards | First-use list | Per-widget error | Data |
| `/students`, `/advising-students` | Find and open a student | Open student | Student list + filters | Staff | List loading | Filtered / first-use | Banner + retry | List |
| `/schedule`, `/schedule/:studentId` | Read a weekly schedule | Print / act on slot | Weekly schedule | Yes | Region loading | Empty week | Region error | Schedule |
| `/my-courses`, `/preferences`, `/eligible-swap-groups`, `/swaps` | Manage registration and swaps | Submit / accept request | Courses, groups, requests | Student | List loading | Empty + next step | Banner | Confirmation |
| `/academic-history`, `/transcript`, `/my-graduation-plan` | Review academic record | Export / open plan | History, transcript, plan | Yes | Region loading | Empty record | Region error | Content |
| `/graduation-plans`, `/graduation-plans/:planId` | Build or review a plan | Submit / approve | Plan, requirements | Advisor / Coordinator | Builder loading | No plan | Banner + retry | Confirmation |
| `/advising-schedules/:studentId/draft` | Draft an advising student's next-term schedule | Add / remove a course | Draft, eligible courses, credit hours | Advisor / Coordinator | Region loading | No draft yet | Banner + retry | Auto-saved |
| `/course-availability` | Check seats left in a published course | Pick a term, then a course | Offerings, slots, capacity | Advisor / Coordinator | Select loading | No published courses | Banner | Live counts |
| `/coordinator/pending-work`, `/coordinator/queue`, `/schedule-history`, `/advisors`, `/schedule-templates`, `/semester-standings`, `/exit-exam-requests` | Process staff work | Act on the selected item | Queues, templates, standings | Coordinator / Admin | Table loading | Cleared / filtered | Banner | Confirmation |
| `/terms`, `/courses`, `/offerings` | Maintain catalogue | Create / edit / import | Terms, courses, offerings | Admin | Table loading | Empty catalogue | Banner | Confirmation |
| `/notifications` | Read updates | Open / mark read | Notifications | Yes | List loading | No notifications | Banner | Read state |
| `/profile` | Maintain own details | Save changes | Profile | Yes | Region loading | n/a | Field + banner | Saved indicator |
| `/wallet` | Review balance and transactions | Pay / top up | Wallet, transactions | Student | Region loading | No transactions | Banner | Confirmation |
| `*` | Recover from a bad URL | Return to a valid page | none | Optional | n/a | n/a | Custom 404 | n/a |

---

## 5. Constraints and non-goals

| Type | Item | Consequence |
| --- | --- | --- |
| Constraint | Role-based access is enforced by the API | The UI explains 403s instead of hiding the reason; routes keep their guards |
| Constraint | Existing workflow rules | UI work does not change statuses, transitions, or validation logic |
| Constraint | Dark-only release | `data-theme="dark"` is forced; both role sets still exist in `brand.css` |
| Non-goal | New features or repaired broken features | Only layout, visual system, states, accessibility, and copy change |
| Non-goal | Light theme or theme toggle | Out of scope for this UI phase |
| Non-goal | Backend, API, data-model, or test changes | Untouched |

---

## 6. Open questions

- The official GUC institutional palette is not recorded in the repo; indigo
  `#4F46E5` is the agreed source color for this release (see
  `decisions/002-indigo-dark-only.md`). Revisit if a brand guide is supplied.
- A product mark or logo asset does not exist; the favicon is a simple
  typographic "U" mark until a licensed asset is provided.
