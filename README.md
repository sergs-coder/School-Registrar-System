# TUA Student Request Portal (SRM System)

Online requests for academic records and registrar forms at Trinity University of Asia.
Students submit and track requests; Registrar staff process them from a back-office dashboard.

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

## Demo accounts

| Role    | Login                                         | Password       |
|---------|-----------------------------------------------|----------------|
| Student | `juan.delacruz@tua.edu.ph` or `2022-10001`    | `Student@2026` |
| Staff   | `staff@tua.edu.ph`                            | `Staff@2026`   |
| Admin   | `admin@tua.edu.ph`                            | `Admin@2026`   |

Juan has one request in every status and sees the Data Privacy consent notice on first login.
The seed adds 24 more students (password `Student@2026`), 11 document types, holidays, and about 80 requests.
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
- **Notifications:** every student-visible status change creates an in-app notification. Important ones
  (submitted, needs correction, approved, processing, ready, shipped, released, rejected) are also emailed
  after the response is sent. Without `SMTP_HOST`, emails go to the backend log; Docker Compose routes them
  to Mailpit.
- **Overdue:** a request is overdue when its estimated release date has passed while the Registrar holds it
  (submitted, under review, resubmitted, payment verified, processing). Time spent waiting on the student
  doesn't count.
- **Concurrency:** staff actions send the request version they saw; if a colleague changed it first, the
  API answers `409 STALE_REQUEST` instead of silently overwriting.
- **Errors:** every API error uses `{"error": {"code", "message", "details": [{field, message}]}}`.

## Roadmap

- [x] **Phase 1:** auth, roles, consent, profile, document catalog, request wizard (draft → submit),
      correction and resubmission, cancellation, My Requests with status tracking, seed data
- [x] **Phase 2:** registrar dashboard, queue (filters, sorting, bulk actions), slide-over request panel,
      status updates with remarks, internal staff notes, assignment, attachment review, in-app and email
      notifications
- [ ] **Phase 3:** payments and proof upload, pick-up slips (PDF), watermarked e-documents, QR verification
- [ ] **Phase 4:** admin settings (document types, fees, holidays, users, announcements), reports and
      exports, audit log viewer, accessibility and performance polish
