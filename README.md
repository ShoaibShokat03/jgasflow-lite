# JGasFlow Online

A SaaS for LPG gas cylinder shops: a web app, and sync for the JGasFlow Android app.

| Folder | What | Port |
|---|---|---|
| `jgasflowlite-backend` | NestJS 11 API with MySQL (raw SQL via mysql2) | 5000 |
| `jgasflowlite-frontend` | React 19, Vite, Tailwind 4 web app (same look as the phone app) | 5002 |

The Android app (Flutter) lives on oldboy: `C:\Users\DELL\Documents\Projects\gasflow-offline`.

## Run locally

Double-click `Run.bat`. It does the following:

1. Starts MySQL from XAMPP.
2. Creates the `jgasflow` database.
3. Installs packages on the first run.
4. Starts the API and the web app, then opens http://localhost:5002.

The API creates and upgrades its tables by itself (`src/db/schema.ts`).

To create the platform Super Admin once, run this in `jgasflowlite-backend`:

```
npm run admin:create -- --login you@example.com
```

The login details are written to `jgasflowlite-backend/storage/super-admin.txt`; they are never printed.

## How it fits together

- **Shops (tenants).**
  - Every shop has its own data.
  - Users log in with a phone number or an email.
  - Roles:
    - **owner**: everything.
    - **manager**: everything except Subscription and Team.
    - **salesman**: sales, payments and customers only, and no deletes.
- **Subscription.**
  - A new shop gets a free trial (`TRIAL_DAYS`).
  - The owner pays by JazzCash, Easypaisa or bank transfer and sends the transaction ID from the **Subscription** page.
  - The Super Admin approves it under **Payments**, which extends the plan.
  - When a plan expires, the shop is read-only: it can view and export data, but cannot add or change records, and phones cannot upload. A suspended shop is locked out.
- **Sync** (`src/sync`, `src/db/tables.ts`).
  - 14 tables are synced. Each row has a `uid`, `updated_at`, `deleted` and a per-shop `version`.
  - Phones push changed rows; the newer edit wins, after correcting for the phone's clock.
  - Phones pull rows with `version > cursor`.
  - Stock and the cylinders customers hold are never synced as numbers. They are sums of `stock_moves` and `held_moves`, so work done on several phones adds up correctly.
  - Bill numbers (S-, P-, R-) are given by the server in online mode.
- **Phone modes** (Settings > Online sync in the app).
  - Offline works exactly as before.
  - Going online means logging in or signing up, then choosing one of:
    - **Upload phone data**: owner only. The online data becomes the phone's data.
    - **Download online data**: the phone gets the online data.
    - **Merge both**: both sets of records are kept. Bills from the phone get new numbers.
  - Switching back to offline keeps all data on the phone.
- **Import / export.**
  - **Data & sync** downloads a full JSON file.
  - The same file format can be imported with **Add to online data** or **Replace online data**.
  - The phone can export the same file under **Settings > Backup**.

## Checks

- Backend typecheck: `npx tsc --noEmit -p tsconfig.json` (backend folder)
- Backend end-to-end: run `node scripts/e2e.mjs` against the running API. It makes throwaway shops and needs a Super Admin.
- Frontend build: `npx vite build` (frontend folder)
- Phone sync against this API, run on oldboy:

  ```
  flutter test test_store/sync_online_test.dart --dart-define=API=http://<this-pc-ip>:5000
  ```

- Phone upgrade from an existing offline database: `flutter test test_store/migration_test.dart`

## Production notes

- Set `NODE_ENV=production`, a long random `TOKEN_SECRET`, `CORS_ORIGINS` and the real `PAY_*` numbers in `.env`.
- Serve the API over HTTPS.
- Build the web app with `VITE_API_URL=https://<api-host>/api`.
- Phones use the server address shown under **Data & sync**.
"# jgasflow-lite" 
