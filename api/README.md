# API Layer (Backend-Ready)

This folder provides a backend-ready API abstraction so the app can move from local storage to real HTTP endpoints with minimal UI changes.

## Modes

- `local` (default): Uses browser local storage persistence.
- `mock`: Simulates async REST behavior with small latency and in-memory draft handling.
- `rest`: Calls backend endpoints (see `backend/` starter).

Set mode via:

`VITE_API_MODE=local`, `VITE_API_MODE=mock`, or `VITE_API_MODE=rest`

For REST auth in demo mode:

- `VITE_API_BASE_URL=http://localhost:4000/api`
- `VITE_DEMO_AUTH_PASSWORD=demo-password-123` (must match backend auth expectation)

## Files

- `client.ts` - Interface contracts for projects, auth, and walkthrough drafts.
- `localStorageClient.ts` - Concrete local storage implementation.
- `mockRestClient.ts` - Mock async API behavior.
- `restClient.ts` - Real HTTP API client.
- `index.ts` - Mode-based client selection.

## Current Integration

`store/projectStore.ts` still exposes existing sync methods for backwards compatibility and now also exports:

- `projectsApi`
- `authApi`
- `draftsApi`

These async APIs are ready for incremental migration of views/services to a real backend.
