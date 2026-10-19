# Release Notes

TUA Student Request Portal (SRM System). Newest changes first.

## 2026-10-20 — Free public demo

- The portal can be deployed as one free Render web service (`render.yaml` and a root `Dockerfile`). The API
  serves the built website from the same address. Demo data reloads on every start.
- **Fix:** `python -m app.seed.seed --reset` no longer fails when uploads are stored outside the backend
  folder (as in Docker Compose).

## 2026-10-19 — Reminders for stalled requests ([#5](https://github.com/sergs-coder/School-Registrar-System/pull/5))

- **Action needed reminders.** When a request has been waiting on the student for more than 2 days
  (a correction, a payment with no receipt, or a pick-up), the student gets an "Action needed" reminder
  every 2 days, up to 3 times per step.
- **Running late notices.** If the Registrar is more than 2 days past the estimated release date, the
  student gets one "taking longer than expected" notice.
- Reminders show in the portal with an "Action needed" tag and are emailed to the university address and
  the confirmed personal address. Urgent emails carry an "ACTION NEEDED" banner.
- Students can turn reminder emails off on their profile.
- Checks run hourly. Admins also have a "send now" button.
- Reminders never cause a stale-request conflict for staff, and their count resets on every status change.
- **For admins/operators:** new `REMINDERS_ENABLED` and `REMINDER_INTERVAL_MINUTES` settings. For cron
  setups, run `python -m app.services.reminders`. Includes a database migration.

## 2026-10-19 — Personal email and tracking emails ([#4](https://github.com/sergs-coder/School-Registrar-System/pull/4))

- **Personal email.** Students can add an optional personal email on their profile. It only receives
  updates after they confirm it through a one-time link (valid 24 hours). Changing it needs a new
  confirmation; confirmation works without signing in.
- **Tracking emails.** Every status change the student can see is emailed to the university address and
  the confirmed personal address, with a progress tracker, the next step, the estimated release date and a
  link to track the request.
- Clearer wording: approvals read "Approved" (including free documents that skip payment) and releases
  read "Released".
- **Fixes:** all text in HTML emails is now escaped. `.env.example` no longer creates empty SQLite
  databases in whatever folder a command was run from.

## 2026-10-19 — Dashboard periods and compact tiles ([#3](https://github.com/sergs-coder/School-Registrar-System/pull/3))

- The submissions chart can show daily, weekly, monthly or yearly counts (Manila time, weeks start Monday).
  The portal remembers your choice.
- Stat tiles are about half as tall, with the icon beside the number.
- **Fixes:** charts no longer cut off multi-digit axis labels (dashboard and reports). A chart that fails
  to load shows a retry message instead of breaking the page.
- **API:** new `GET /staff/submissions?granularity=day|week|month|year`.

## 2026-10-19 — Phase 4: admin back office, reports and audit log ([#2](https://github.com/sergs-coder/School-Registrar-System/pull/2))

- **Admin pages** (admins only): document types (fees, questions, required files, visibility), office
  settings and courier fees, closed days, announcements, and staff accounts. Admins can invite staff by
  email, deactivate, unlock and resend password links. Admins can't lock themselves out or remove the last
  active admin.
- **Reports:** volume, turnaround, on-time rate and fees for a date range, with request and payment CSV
  exports. Exports are logged and protected against spreadsheet formula injection.
- **Audit log** viewer with filters and CSV export.
- **Faster loading:** pages load on demand. The main download dropped from 602 kB to 172 kB.
- **Accessibility:** all tested pages pass WCAG 2.1 AA checks, and chart colors work for color-blind
  readers in light and dark mode.

## 2026-10-19 — Phase 3: payments, pick-up slips and verified e-documents ([#1](https://github.com/sergs-coder/School-Registrar-System/pull/1))

- **Payments:** students upload proof of payment while a request awaits payment. Staff verify it, or
  reject it with a reason that notifies the student.
- **Pick-up slips:** a PDF slip with a QR code once a pick-up request is ready.
- **E-documents:** staff upload signed PDFs; students download a copy stamped on every page with their
  name, reference number and a QR code, locked against editing. Replacing or revoking a copy invalidates
  its code.
- **Verification:** anyone can check a document at `/verify/<code>`.
- Dashboard tile, queue filter and sidebar links for payments and releases.
- Generated and local files (dependencies, builds, databases, uploads, `.env`) are no longer tracked in git.

## 2026-10-18 — Initial release (Phases 1 and 2)

- **Students:** sign-in, consent, profile, document catalog, request wizard (draft and submit),
  corrections and resubmission, cancellation, and My Requests with status tracking.
- **Registrar staff:** dashboard, request queue with filters, sorting and bulk actions, request side panel,
  status updates with remarks, internal notes, assignment, attachment review, and in-app and email
  notifications.
