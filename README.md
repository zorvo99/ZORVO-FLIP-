# Zorvo IQ App

## MVP demo checklist (RenovateIQ)

Use this for a short end-to-end walkthrough in the app (not the marketing site):

1. **Create a project** from the home / projects list.
2. **Add a kitchen** (or pick Kitchen when adding a room).
3. **Open the room** and go to **Plan & Scope**.
4. **Enter dimensions** (length, width, height) so floor area and the estimate band update.
5. **Select structured scope** options; confirm the **source** shows **Pricing v1** when rules apply, otherwise **Area band**.
6. **Save room** and confirm you return to **Project details** and the project estimate line updates.
7. **Open project estimate summary** and confirm **totals** and the disclaimer: *Indicative estimate only. Not a professional quote.*

**Room types to spot-check (same flow each):** Kitchen, Laundry, Bathroom, Ensuite, Living, Dining, Bedroom, Study, Alfresco, Outdoors (external works), Garage.

## Demo script (Estimated vs Quoted vs Actual Paid)

Use this exact flow for a non-technical live demo:

1. Open **Cherry Ave Renovation** from Dashboard.
2. Show the project **Estimated** totals from walk-through scope.
3. Open **Kitchen**.
4. Show **Structured scope** in Plan.
5. Go to **Est / Quote / Paid** tab.
6. Show existing quote entries (received + accepted), or add one.
7. Show existing **Actual Paid** entry, or add one.
8. Return to **Project details**.
9. Open **Analytics**.
10. Show **Estimated vs Quoted vs Actual Paid** and the variance insight cards.

Narrative summary:
- RenovateIQ first **estimates** cost during walk-through.
- Then it records real **quotes** from builders/trades.
- Then it tracks **actual paid** cost and shows **variance**.

---

Zorvo IQ is a house-inspection-first renovation scoping app with:

- Fast room-by-room walkthrough capture
- Structured scope inputs (dropdowns, toggles, quantities)
- Room budgeting and expense tracking
- AI-assisted discovery hooks
- Analytics and portfolio tracking

## Frontend (Vite + React)

### Run locally

1. `npm install`
2. `npm run dev`

### Build

- `npm run build`
- `npm run preview`

## Backend (Express + Prisma)

A backend starter is included in `backend/`.

### Run backend

1. `cd backend`
2. `cp .env.example .env`
3. Fill `DATABASE_URL` and `JWT_SECRET`
4. `npm install`
5. `npm run prisma:generate`
6. `npm run prisma:migrate -- --name init`
7. `npm run dev`

API base URL: `http://localhost:4000/api`

## API Mode Switch

Frontend API client supports:

- `VITE_API_MODE=local` (default)
- `VITE_API_MODE=mock` (simulated async API)
- `VITE_API_MODE=rest` (real backend via REST)

When using REST mode, also set:

- `VITE_API_BASE_URL=http://localhost:4000/api`
- `VITE_DEMO_AUTH_PASSWORD=demo-password-123`
