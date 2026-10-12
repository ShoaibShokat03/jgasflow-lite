# ChipsTrader frontend

React 19 + Vite 7 + Tailwind CSS 4 + TanStack Query. Talks to the NestJS API in `../chipstrader-backend`.

## Run it

```bash
npm install
npm run dev          # http://localhost:5002 (proxies /api to http://localhost:5000)
npm run build        # production build in dist/
```

Copy `.env.example` to `.env` to change the API location. In production either
serve `dist/` behind the same domain as the API (with `/api` reverse-proxied), or
set `VITE_API_URL` before building. Any unknown path must fall back to
`index.html` (single-page app).

## Layout

```
src/
  components/ui/       Button, Field, DataTable, Modal, Drawer, Combobox, toasts…
  components/layout/   AppShell (sidebar, top bar), CommandPalette (Ctrl/⌘ K), logo
  components/charts    Dependency-free SVG charts
  features/            One folder per area: documents, crm, invoices, warehouse,
                       fulfilment, sourcing, admin, assistant, dashboard, track
  lib/                 api client (token refresh), hooks, formatting
```

`features/documents` is one generic list + detail implementation that serves all
five pipeline documents (requirements, quotes, sales orders, supplier offers,
purchase orders), configured in `doc-types.js`.

## Keyboard

| Keys | Action |
| --- | --- |
| `Ctrl/⌘ K` or `/` | Search parts, documents, companies and pages |
| `Ctrl/⌘ J` | Open the assistant |
| `Enter` in the quick-add row | Add a line to a document |
