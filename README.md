# TUA Student Request Portal (SRM System)

Online requests for academic records and registrar forms at Trinity University of Asia.
Students submit and track requests; Registrar staff process them from a back-office dashboard.
See [RELEASE_NOTES.md](RELEASE_NOTES.md) for what changed in each update.

```
/backend   FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL (SQLite for local dev) · JWT · pytest
/frontend  React 19 (JSX) · Vite · Tailwind CSS v4 · shadcn-style UI on Radix · React Router ·
           TanStack Query · React Hook Form + Zod · Axios · Lucide
```

## Quick start (local, no Docker)

Requirements: Python 3.12+, Node 20+.

```bash
# Backend: http://localhost:8000/api/v1/docs
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env
.venv/bin/python -m app.seed.seed --reset    # creates srm.db, runs migrations, loads demo data
.venv/bin/uvicorn app.main:app --reload --port 8000

# Frontend: http://localhost:5173
cd frontend
npm install
cp .env.example .env
npm run dev
```

The Vite dev server proxies `/api` to the backend, so the httpOnly refresh cookie works without CORS setup.

## Quick start (Docker Compose)

```bash
docker compose up --build
docker compose exec backend python -m app.seed.seed --reset
```

Frontend at http://localhost:5173, API docs at http://localhost:8000/api/v1/docs,
and dev email inbox (Mailpit) at http://localhost:8025.

## Free public demo (Render)

[`render.yaml`](render.yaml) deploys the whole portal as one free Render web service: the root
[`Dockerfile`](Dockerfile) builds the frontend and the API serves it from the same origin. On Render, click
**New → Blueprint**, pick this repository and click **Apply**.

This setup is for demos only: every start loads fresh demo data into SQLite, so changes and uploads are lost
when the service restarts or sleeps (free services sleep after 15 minutes idle; the first visit after that
takes about a minute). Emails are written to the service log instead of being sent.

## Demo accounts

| Role    | Login                                         | Password       |
|---------|-----------------------------------------------|----------------|
| Student | `juan.delacruz@tua.edu.ph` or `2022-10001`    | `Student@2026` |
| Staff   | `staff@tua.edu.ph`                            | `Staff@2026`   |
| Admin   | `admin@tua.edu.ph`                            | `Admin@2026`   |

Juan has one request in every status and sees the Data Privacy consent notice on first login.
The seed adds 24 more students (password `Student@2026`), 11 document types, holidays, about 80 requests,
a few booked pick-up times for today and two alumni access requests waiting for review.
To restart the demo from scratch, run `python -m app.seed.seed --reset` again.

## Tests

```bash
cd backend && .venv/bin/python -m pytest -q
```

## Branding

All colors live in [`frontend/src/styles/tokens.css`](frontend/src/styles/tokens.css). The current palette
(royal blue + gold) is a placeholder: replace the `--brand-*` values with colors from the official logo.
To use the real logo, put it in `frontend/public/` and swap the placeholder SVG in
[`frontend/src/components/brand/Logo.jsx`](frontend/src/components/brand/Logo.jsx).
Request status colors (`--status-*`) are defined in the same file and drive every badge, stepper and timeline.

## Key design points

- **Status workflow:** every change goes through one state machine
  ([`backend/app/services/workflow.py`](backend/app/services/workflow.py)), which checks who may move a request
  where, and logs each transition with actor, time and remarks.
- **Reference numbers:** `SRM-<year>-<6 digits>`, from a row-locked counter.
- **Auth:** 15-minute access tokens are kept in memory only. 7-day refresh tokens live in a rotating httpOnly
  cookie, and replaying an old one ends every session for that user. Argon2 password hashing, account lockout
  after 5 failed attempts, and rate-limited login.
- **Privacy (RA 10173):** a consent gate on first login; students can only ever see their own requests
  (other reference numbers return 404); uploads are checked by their actual file contents (magic bytes),
  limited to 5 MB, encrypted at rest (Fernet), and served only through an authorized endpoint; logins,
  staff record views and downloads are written to `audit_logs`.
- **Notifications:** every status change a student can see creates an in-app notification and a tracking
  email. The email has a progress tracker (Submitted → Review → Payment → Processing → Ready → Released), the
  next step, the estimated release date and a "Track your request" link. Approvals and releases say so plainly
  ("Approved", "Released"). Payment rejections and new e-documents are emailed too. Emails go out after the
  response is sent.
- **Personal email:** students can add a personal address on their Profile page (graduates often lose their
  university mailbox). It receives updates only after they confirm it through a one-time link valid for 24
  hours; changing it needs a new confirmation. Without `SMTP_HOST`, emails go to the backend log; Docker
  Compose routes them to Mailpit.
- **Alumni and former students:** anyone without an account (or who lost their university mailbox) can ask for
  access at `/alumni-access` with their student number, name, birth date, program, an email address and a photo
  of a valid ID. Staff review it under **Alumni access**, which compares it with the student record on file.
  Approving links it to that record (or creates one) and emails a 72-hour set-password link. The address becomes
  the student's confirmed personal email, so they can sign in and reset their password with it.
- **Approval emails** state the amount due and the payment instructions.
- **Reminders:** checked every hour (and on demand from admin Settings). A request waiting on the student for
  more than 2 days (correction, payment with no receipt uploaded, or pick-up) gets an "Action needed" reminder,
  repeated every 2 days, at most 3 per step. A request more than 2 days past its estimated release date while the
  Registrar holds it gets one "taking longer than expected" notice. Reminders always appear in-app; they're
  emailed to the university and confirmed personal address unless the student turns reminder emails off on their
  Profile. Each status change starts the clock over. With several backend instances, set `REMINDERS_ENABLED=false`
  on all but one, or run `python -m app.services.reminders` from cron instead.
- **Overdue:** a request is overdue when its estimated release date has passed while the Registrar holds it
  (submitted, under review, resubmitted, payment verified, processing). Time spent waiting on the student
  doesn't count.
- **Payments:** while a request is Awaiting Payment, the student uploads a receipt (method, OR/transaction no.,
  date paid). Staff verify it with "Mark payment verified" or reject it with a reason, which emails the student and
  lets them upload again. Verifying goes through the state machine, so every verified request has exactly one
  verified `payments` row; with no uploaded proof it is recorded as a cashier payment.
- **Pick-up slips and e-documents:** a pick-up slip PDF (with QR) is available while a pick-up request is Ready for
  Pick-up. For document types with `allow_edocument`, staff upload the signed PDF once processing starts; students
  can download it once the request is released. The clean file is never served to students: every download is
  stamped on each page with the holder's name, reference number and a QR code, and locked against editing.
  Replacing or revoking a copy invalidates its code.
- **Courier addresses:** for Metro Manila, students pick the city or municipality, then its barangay
  ([`backend/app/data/metro_manila.json`](backend/app/data/metro_manila.json), from the PSGC, with the EMBO
  barangays under Taguig). The server rejects a barangay that isn't in the chosen city. Addresses outside
  Metro Manila stay free text. Every courier address can include a landmark for the courier.
- **Pick-up appointments:** once a pick-up request is Ready for Pick-up, the student books a one-hour slot from
  the Registrar's open hours (set by admins: hours per weekday, students per slot, students per day (default
  15), how many days ahead) and can change or cancel it. Closed days have no slots, and once a day is full the
  student has to choose another day. Each booking holds one numbered seat in its slot and one in its day, and
  unique constraints make sure two students can't take the last seat at once. The time is printed on the pick-up
  slip, shown on the staff request panel, and listed day by day on the dashboard.
- **QR verification:** each slip and e-document has a random 16-character code (`issued_documents`). Anyone can
  check it at `/verify/<code>` without logging in (rate-limited). The page shows only what is printed on the
  document, with the student number masked.
- **Dashboard:** compact stat tiles and a submissions chart that switches between daily, weekly, monthly and
  yearly counts (Manila time, weeks start Monday; the choice is remembered). Empty periods show as zero, and
  a chart that fails to load shows a retry message.
- **Admin back office** (admins only, under `/registrar/admin`):
  - **Document types:** add, edit or hide types, with their fees, extra questions and required files. Submitted
    requests keep the terms in their snapshot; drafts follow the catalog.
  - **Settings:** office details, courier fees, payment instructions, pick-up hours, closed days (which push
    back estimated release dates and close pick-up slots) and announcements on the student home page.
  - **Users:** add staff and admins, who set their own password through an emailed 72-hour link (shown on screen
    in development). Admins can also deactivate (which signs the person out everywhere), unlock or resend a
    password link. Admins can't lock themselves out or remove the last active admin.
  - **Student import:** upload the enrollment list as CSV (`student_no, email, first_name, last_name`, plus
    optional `middle_name, suffix, program, year_level, birthdate, contact_no`). A preview lists new rows, rows
    skipped because the student number or email already has an account, and rows with errors. Confirming
    creates the new accounts and emails each student a 72-hour set-password link. Re-uploading the same list
    is safe.
  - **Reports:** volume, turnaround, on-time rate and fees for a date range, plus request and payment CSV exports.
    Exports are logged and protected against spreadsheet formula injection.
  - **Audit log:** filter by action, person, record and date; export to CSV (also logged).
- **Performance and accessibility:** pages load on demand, so students never download the back office or its
  charts. Pages pass axe-core WCAG 2.1 AA checks, and chart colors are validated for color-blind readers in
  light and dark mode.
- **Concurrency:** staff actions send the request version they saw; if a colleague changed it first, the
  API answers `409 STALE_REQUEST` instead of silently overwriting.
- **Errors:** every API error uses `{"error": {"code", "message", "details": [{field, message}]}}`.

## Roadmap

- [x] **Phase 1:** auth, roles, consent, profile, document catalog, request wizard (draft → submit),
      correction and resubmission, cancellation, My Requests with status tracking, seed data
- [x] **Phase 2:** registrar dashboard, queue (filters, sorting, bulk actions), slide-over request panel,
      status updates with remarks, internal staff notes, assignment, attachment review, in-app and email
      notifications
- [x] **Phase 3:** payments and proof upload, pick-up slips (PDF), watermarked e-documents, QR verification
- [x] **Phase 4:** admin settings (document types, fees, holidays, users, announcements), reports and
      exports, audit log viewer, accessibility and performance polish
