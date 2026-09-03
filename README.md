# Vellocity3D — Product Shop (React + Express/Axios CRUD)

A local dev clone of the Vellocity3D storefront: dark 3D-print-studio theme,
hero section, "How the work is made" process section, and a fully working
CRUD product catalog.

- **Frontend:** React 18 + Vite, styled to match the reference site, talks to
  the backend via **axios**.
- **Backend:** Node.js + Express, in-memory "database" (resets on restart),
  full CRUD REST API on `/api/products`, seeded with 3 dummy products.

## Project structure

```
product-shop/
  backend/     -> Express API (port 5000)
  frontend/    -> React app (port 5173)
```

## 1. Run the backend

```bash
cd backend
npm install
npm start
```

You should see: `Product Shop API listening on http://localhost:5000`

Test it in the browser: http://localhost:5000/api/products — you should see
the 3 dummy products as JSON.

(Optional, for auto-restart on file changes: `npm run dev` instead of
`npm start` — requires the `nodemon` devDependency, already listed.)

## 2. Run the frontend

Open a **second terminal** (keep the backend running):

```bash
cd frontend
npm install
npm run dev
```

Vite will print a local URL, normally: http://localhost:5173

Open that in your browser — the storefront should load and show the 3 dummy
products pulled live from the backend.

## CRUD endpoints (backend)

| Method | Route              | Description          |
|--------|---------------------|-----------------------|
| GET    | /api/products        | List all products     |
| GET    | /api/products/:id     | Get one product       |
| POST   | /api/products        | Create a product       |
| PUT    | /api/products/:id     | Update a product       |
| DELETE | /api/products/:id     | Delete a product       |

## Using the app

- **Add product** — click "+ Add product" above the grid, fill the form.
- **Edit** — click "Edit" on any product card.
- **Delete** — click "Delete" on any product card (asks for confirmation).

All changes go through the API and update the in-memory list on the server —
refreshing the page will re-fetch from the backend, but restarting the
backend server resets it back to the 3 dummy products.

## Notes / next steps

- Data is in-memory only — swap in a real database (e.g. SQLite, MongoDB,
  Postgres) in `backend/server.js` when you're ready to persist data.
- The `image` field just takes a URL — wire up real file uploads later if
  needed.
- Ports are hardcoded (`5000` backend, `5173` frontend) — edit
  `frontend/src/api.js` and `backend/server.js` if you need to change them.
