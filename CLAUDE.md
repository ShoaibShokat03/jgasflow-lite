# JGasFlow Online

SaaS for LPG gas cylinder shops. It has a web app and syncs with the JGasFlow Android app (Flutter, on oldboy at `C:\Users\DELL\Documents\Projects\gasflow-offline`). See README.md for how it fits together.

- `jgasflowlite-backend`: NestJS 11 + MySQL through mysql2, using raw SQL and no ORM. Port 5000.
  - The schema lives in `src/db/schema.ts`.
  - The synced tables are defined in `src/db/tables.ts`, which must match `lib/sync/sync_tables.dart` in the app.
- `jgasflowlite-frontend`: React 19, Vite, Tailwind 4, TanStack Query. Port 5002.
- `Run.bat` starts MySQL (XAMPP), the API and the web app.
- Old ChipsTrader code is in each project's `_archive/` folder. It is not used.

## Rules

- **The same business rules as the phone app.** `src/gas/gas.service.ts` is a port of `lib/data/repo.dart`. Change both together.
- **Keep the user manual current.** When a screen or feature changes, update `jgasflowlite-frontend/src/features/manual.js` in both English and Roman Urdu, quoting the exact on-screen labels in **bold**, and bump `MANUAL_UPDATED`.
- **Never sync counters.** Stock comes from `stock_moves` and customer cylinders come from `held_moves`.
- Every write to a synced table goes through `Writer` (`src/db/writer.ts`), so it gets a version.
- **Wording.** All UI text is in English and Roman Urdu, in `src/lib/strings.web.js` (web) and `lib/core/strings.dart` (app).
  - No em or en dashes anywhere. Use commas, colons or "to".
  - Buttons never wrap onto a second line.
- **Styling** matches the app:
  - Navy #020033 with an orange accent #F26B1D.
  - Cards have 12px corners and a border on all sides, never a single-side stripe.
- The page always keeps its vertical scrollbar and never scrolls horizontally. Popups must not lock the body scroll.
- Password fields use `PasswordInput`, which has a show/hide eye.
- Users are never seeded from `.env`. The Super Admin is created with `npm run admin:create`.
- Never print credentials or tokens in chat.
- Never commit or push unless asked.

## Checks

- `npx tsc --noEmit -p tsconfig.json` (backend)
- `node scripts/e2e.mjs` (backend, against the running API; 43 checks)
- `npx vite build` (frontend)
- `flutter analyze` and `flutter test test_store/sync_online_test.dart --dart-define=API=http://<pc-ip>:5000` (app, on oldboy)
