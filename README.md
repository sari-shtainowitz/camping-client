# Camping — React client (Step 15)

A small React + TypeScript (Vite) client whose only job is to prove the Camping
API works end to end. It is **not** part of `Camping.sln` and lives in its own
folder so client and server can be versioned / deployed separately.

## What it does

| # | Feature | Where |
|---|---------|-------|
| 1 | Login & registration; JWT saved and sent as `Authorization: Bearer …` | `src/auth.tsx`, `src/api.ts`, `src/pages/LoginPage.tsx` |
| 2 | List screen with **real server-side pagination** (`page` / `pageSize` sent to the server) | `src/pages/TentsPage.tsx` |
| 3 | Action on the limited resource — book a tent (Customer) | `src/pages/TentsPage.tsx` |
| 4 | HTTP **409 Conflict** handling — clear message when the tent was taken | `src/api.ts` (`ApiError.status`), `src/pages/TentsPage.tsx` |
| 5 | PDF booking confirmation (Customer) | `src/pdf/*` |

### Admin-only screens (role `Admin`)

| Screen | Nav | Where |
|--------|-----|-------|
| **ניהול אוהלים** — add / edit / delete tents; Delete is disabled for a tent with an active reservation (the API also rejects it) | "ניהול אוהלים" | `src/pages/AdminTentsPage.tsx` |
| **לוח הזמנות** — read-only schedule of every reservation (tent, guest, dates, nights, status; current occupancy highlighted) | "לוח הזמנות" | `src/pages/AdminSchedulePage.tsx` |

Admins are routed to these pages and never see the Customer booking screen; Customers never see the Admin nav or pages.

## Run it

1. Start the API on `http://localhost:5199` (from `../Camping.API`):

   ```
   set ASPNETCORE_URLS=http://localhost:5199
   dotnet run --project ../Camping.API
   ```

   (Or run it however you like and set `VITE_API_PROXY_TARGET` to its URL.)

2. Start the client:

   ```
   npm install
   npm run dev
   ```

   Open http://localhost:5173. Vite proxies `/api/*` to the API, so the browser
   stays same-origin and the server needs no CORS changes.

## Build

```
npm run build      # tsc -b && vite build  ->  dist/
```

## API endpoints used

- `POST /api/auth/register`, `POST /api/auth/login` — get a JWT
- `GET  /api/auth/me` — resolve the current user id (needed to create a reservation)
- `GET  /api/tents?page={n}&pageSize={m}` — paginated list
- `POST /api/reservations` — book a tent, Customer-only (may return `409 Conflict`)
- `POST` / `PUT` / `DELETE /api/tents/{id}` — Admin tent management
- `GET  /api/reservations`, `GET /api/users`, `GET /api/camping-sites` — Admin schedule / tent form
