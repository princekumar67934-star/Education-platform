# StudyMate (core build)
Full-stack student assignment manager: React + Vite + Tailwind v4 + Recharts, Express, PostgreSQL + Prisma.

## Setup
1. Create a PostgreSQL database.
2. `cd server && cp .env.example .env` and fill in DATABASE_URL and a long random JWT_SECRET.
3. `npm install && npx prisma migrate dev --name init && npm run dev` (API on :4000, reminder scheduler starts with it).
4. `cd client && npm install && npm run dev` (open http://localhost:5173).

## Implemented
Registration/login (bcrypt + JWT), per-user data isolation, assignment CRUD with subjects, auto categories
(upcoming/pending/completed/overdue), search/filter, dashboard stats + chart, server-side reminder scheduler (24h/12h/1h,
per-user preferences, duplicate-safe via unique constraint), notification center + browser notifications, AI planner
(Anthropic API if ANTHROPIC_API_KEY is set, otherwise a clearly labelled rule-based fallback).

## Not yet built
3D landing page / R3F, calendar & study planner pages, analytics page, profile/settings UI, dark/light toggle,
forgot-password, notification sound. Schema already has StudySession and Preference models.
Note: this build was written without network access, so it has NOT been installed or run. Expect small fixes on first run.
