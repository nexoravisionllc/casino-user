# User Portal — Crypto Casino Demo

A crypto-casino style home page (inspired by the provided reference) with a
React front end and a Node.js back end.

## Stack

| Part      | Technology                                            |
|-----------|-------------------------------------------------------|
| Frontend  | React 19 + Vite 6                                     |
| Backend   | Node.js (>= 22) + Express 5, in `user-backend/`       |
| Database  | **Solution** MySQL 8+ database, shared with Admin     |
| Auth      | JWT access token, PBKDF2 password hashing             |

The backend was ported from the ASP.NET Core 8 `UserBackend/` project, which is
kept for reference. The HTTP API, JSON shapes, JWTs (same key/issuer/audience),
password hashes and the FortuneGate callback protocol are unchanged.

## Database

The tables are shared with `Admin/admin-backend`. On startup the backend creates
the database and any missing tables (`user-backend/src/schema.js`), adds
`Users.UserCode` if needed, and seeds the accounts below **only into empty tables**.

### Moving the data from SQL Server

Use Admin's one-time copy (`npm run migrate:mssql` in `admin-backend`, see its
README). Two things to watch:

- **Run it before the first start of this backend against an empty MySQL.**
  Seeding fills `Partners` and `Users`, and the copy skips tables that already
  have rows (unless you pass `--force`, which replaces them).
- The copy reports `Users.UserCode` as not copied when the column doesn't exist
  in MySQL yet. Nothing breaks: each player's code is fetched again from
  FortuneGate on their next launch.

## Seeded accounts

| LoginId | Password    | Role  | Notes                                        |
|---------|-------------|-------|----------------------------------------------|
| `Admin` | `@12345#$%` | Partner, role 1 | Super administrator                |
| `agent` | `@12345#$%` | Partner, role 2 | Parent is `Admin`                  |
| `user`  | `@12345#$%` | User  | PartnerId → agent, random US bank, bal 1000 / point 250 |

## Run

Requires a MySQL 8+ server. Set `DB_HOST`, `DB_USER`, `DB_PASSWORD` and `DB_NAME`
(or `DATABASE_URL`) in `user-backend/.env`; see `.env.example` for every setting.
Real environment variables override the file. `NOTIFY_SECRET` must match Admin's.

Open two terminals.

**Backend** (http://localhost:5090):
```powershell
./start-backend.ps1
```

**Frontend** (http://localhost:5173):
```powershell
./start-frontend.ps1
```

Then open http://localhost:5173 and sign in with `user` / `@12345#$%`. Live
balance updates come from the wallet hub in Admin's backend (port 5100), so run
that too.

## Tests

```powershell
cd user-backend
npm test
```

`test/decimal.test.js` and `test/http.test.js` need no database. The others need a
disposable MySQL server: set `TEST_DB_HOST`, `TEST_DB_PORT` (default 33306),
`TEST_DB_USER`, `TEST_DB_PASSWORD` and `TEST_DB_NAME` (default `user_backend_test`).
They truncate every table, so the name must contain "test". FortuneGate and the
admin hook are mocked; no test reaches the real game API.

## Home page behavior

- **Header** — search and language switch removed. Logged out: Sign In / Sign Up.
  Logged in: user name + balance + point, with a Logout button where the
  language switch used to be.
- **Sidebar** — Application card kept (phone art) with Sports / Casino ad tiles;
  BC Token and World Cup Hub hidden; Casino sub-menu limited to Hot Games, Slots,
  Live Casino, Providers; Dark / Light theme switch at the bottom.
- **Content** — Join the Untamed banner (Sign Up only), Game of the Week,
  Recent Big Wins (All / Slots / Live Casino), Casino & Sports tiles, and the
  Hot Games / Live Casino / Slots scrolling rows, followed by the footer.
