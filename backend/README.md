# Zorvo IQ Backend

Production-ready backend starter for Zorvo IQ.

## Stack

- Node.js + Express + TypeScript
- PostgreSQL + Prisma
- JWT auth
- Zod validation

## Setup

1. Copy env template:

`cp .env.example .env`

2. Update `.env` values (`DATABASE_URL`, `JWT_SECRET`, etc).

3. Install and prepare DB:

`npm install`

`npm run prisma:generate`

`npm run prisma:migrate -- --name init`

4. Start API:

`npm run dev`

API base: `http://localhost:4000/api`

## Endpoints

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `PATCH /api/projects/:projectId`
- `PATCH /api/projects/:projectId/unlock`
- `PATCH /api/projects/:projectId/rooms/:roomId`
- `GET /api/drafts/:projectId`
- `PUT /api/drafts/:projectId`
- `DELETE /api/drafts/:projectId`

## Frontend integration

The frontend already has API abstraction in `api/*`.
Next step is adding `api/restClient.ts` and switching mode:

`VITE_API_MODE=rest`

`VITE_API_BASE_URL=http://localhost:4000/api`
