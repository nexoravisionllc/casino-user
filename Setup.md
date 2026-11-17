# Casino install guide

This guide installs the whole platform from scratch on one Ubuntu server:

- the **player site**: the `casino-user` repo (user frontend + user API)
- the **admin panel**: the `casino-admin` repo (admin frontend + admin API)

Both apps share one MySQL database named `Solution`. Each section ends with a check. Don't move on until the check passes.

For day-to-day use after installation, see `HOW-TO-USE.md` in each repo.

## Contents

0. [How the pieces fit together](#0-how-the-pieces-fit-together)
1. [What you need before starting](#1-what-you-need-before-starting)
2. [DNS, packages and firewall](#2-dns-packages-and-firewall)
3. [The casino Linux user and Node.js](#3-the-casino-linux-user-and-nodejs)
4. [Clone both repositories](#4-clone-both-repositories)
5. [MySQL](#5-mysql)
6. [Backend environment files](#6-backend-environment-files)
7. [Install packages and build the frontends](#7-install-packages-and-build-the-frontends)
8. [systemd services](#8-systemd-services)
9. [Nginx and HTTPS](#9-nginx-and-https)
10. [FortuneGate](#10-fortunegate)
11. [Final checks and first login](#11-final-checks-and-first-login)
12. [Updating to a new release](#12-updating-to-a-new-release)
13. [Backups](#13-backups)
14. [Troubleshooting](#14-troubleshooting)
15. [Local development on Windows](#15-local-development-on-windows)

---

## 0. How the pieces fit together

```text
                       Internet (only ports 80 / 443 open)
                                     │
                                  Nginx
        ┌────────────────────────────┴─────────────────────────────┐
  example.com (player site)                    admin.example.com (admin panel)
   /            → user-frontend/dist             /          → admin-frontend/dist
   /api/        → user API  127.0.0.1:5090        /api/      → admin API 127.0.0.1:5100
   /callback    → user API  127.0.0.1:5090        /uploads/  → admin API 127.0.0.1:5100
   /hubs/       → admin API 127.0.0.1:5100        /hubs/     → admin API 127.0.0.1:5100
        │                                                           │
        └──────────────► MySQL "Solution" (127.0.0.1:3306) ◄────────┘

  user API ── POST /api/wallet/notify (header X-Notify-Secret) ──► admin API
  FortuneGate ── POST https://example.com/callback (header Callback-Token) ──► user API
```

| Public site | Repo folder | Nginx serves | API |
|---|---|---|---|
| `https://example.com` | `/opt/casino/casino-user` | `user-frontend/dist` | user API on `127.0.0.1:5090` |
| `https://admin.example.com` | `/opt/casino/casino-admin` | `admin-frontend/dist` | admin API on `127.0.0.1:5100` |

What this means in practice:

- **The admin API hosts the live wallet connection** (`/hubs/wallet`, SignalR) for both sites. That's why the player site forwards `/hubs/` to port **5100**, not 5090.
- **How a balance change reaches the player's screen.** A game round, deposit, or adjustment changes the balance in MySQL. The user API then sends `POST /api/wallet/notify` to the admin API, and the admin API pushes the new balance to the player's browser. That request only succeeds if **`NOTIFY_SECRET` is identical in both `.env` files**. If the values differ, the header balance stops updating live.
- **Fallback when live updates fail.** The player site also re-reads the balance (`GET /api/auth/me`) on page load and whenever the player returns to the tab. A refresh therefore always shows the correct balance.

Everywhere below, replace `example.com` with the real player domain and `admin.example.com` with the real admin domain.

## 1. What you need before starting

| Item | Notes |
|---|---|
| Ubuntu 22.04 or 24.04 server | 2 GB RAM is enough. You need `sudo`. |
| Two domain names | One for players, one for the admin panel. You need access to their DNS. |
| GitHub access | Both repos are private. You need a GitHub account or personal access token with read access to `nexoravisionllc/casino-user` and `nexoravisionllc/casino-admin`. |
| FortuneGate agent credentials | The **agent token** (for API calls) and the **callback token** (FortuneGate sends it with every seamless callback). |

Generate the secrets you will need now and keep them somewhere safe:

```bash
openssl rand -hex 32   # DB password for the casino MySQL user
openssl rand -hex 32   # JWT_KEY for the user API
openssl rand -hex 32   # JWT_KEY for the admin API (must be different)
openssl rand -hex 32   # NOTIFY_SECRET (the SAME value goes in both .env files)
```

## 2. DNS, packages and firewall

Point both names at the server's public IP. Certbot (section 9) fails until these records resolve.

```text
example.com        A    <server-ip>
admin.example.com  A    <server-ip>
```

Install the system packages:

```bash
sudo apt update
sudo apt install -y curl git ca-certificates nginx certbot python3-certbot-nginx mysql-server
sudo systemctl enable --now mysql nginx
```

Open only SSH, HTTP and HTTPS. MySQL (3306) and the two APIs (5090, 5100) must **not** be reachable from the internet. Both APIs listen on `127.0.0.1` only.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

**Check:** `dig +short example.com` and `dig +short admin.example.com` both print the server IP. `ufw status` lists only OpenSSH and Nginx Full.

## 3. The casino Linux user and Node.js

The services run as a dedicated, unprivileged Linux user called `casino`. The user API needs **Node.js 22 or newer**. The admin API needs 20.12 or newer, so one Node 22 install covers both.

Install Node with nvm **as the `casino` user, not as root**. systemd runs the services as `casino`, and that user can't read a Node binary under `/root`.

```bash
sudo adduser --disabled-password --gecos "" casino
sudo mkdir -p /opt/casino
sudo chown casino:casino /opt/casino
sudo -iu casino
```

Stay in that `casino` shell for this section and the next:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm install 22
nvm alias default 22
node -v            # v22.x.x
command -v node    # e.g. /home/casino/.nvm/versions/node/v22.23.5/bin/node
```

**Write down the path that `command -v node` prints.** Both systemd units in section 8 need it exactly.

## 4. Clone both repositories

Still as `casino`:

```bash
git clone https://github.com/nexoravisionllc/casino-user.git  /opt/casino/casino-user
git clone https://github.com/nexoravisionllc/casino-admin.git /opt/casino/casino-admin
```

When git asks for a password, enter a GitHub personal access token, not your GitHub password. To avoid typing the token on every `git pull`, run `git config --global credential.helper store` once. The token is then saved in `~/.git-credentials`.

Resulting layout:

```text
/opt/casino/casino-user/user-backend      user API (Express, port 5090)
/opt/casino/casino-user/user-frontend     player site (React + Vite)
/opt/casino/casino-admin/admin-backend    admin API + wallet hub (Express, port 5100)
/opt/casino/casino-admin/admin-frontend   admin panel (React + Vite)
```

If an older copy is already running (from `/opt/casino-user` or anywhere else), stop it first. Two processes can't share port 5090 or 5100:

```bash
exit   # back to your sudo user
sudo systemctl disable --now casino-user-api casino-admin-api 2>/dev/null
sudo ss -ltnp | grep -E ':5090|:5100'   # must print nothing
```

## 5. MySQL

Create the database and a dedicated MySQL user. Use the DB password you generated in section 1.

```bash
sudo mysql
```

```sql
CREATE DATABASE IF NOT EXISTS Solution
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'casino'@'127.0.0.1' IDENTIFIED BY 'the-db-password';
GRANT ALL PRIVILEGES ON Solution.* TO 'casino'@'127.0.0.1';
GRANT CREATE ON *.* TO 'casino'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

The global `CREATE` grant is required because each API runs `CREATE DATABASE IF NOT EXISTS` at startup.

You don't need to create tables. **On first start, each API creates any missing tables.** If the account tables are empty, the user API also inserts the demo accounts below, and the admin API inserts the default game-visibility settings. All three accounts use the password `@12345#$%`:

| Login | Type | Signs in at |
|---|---|---|
| `Admin` | Super admin (Partners, role 1) | `https://admin.example.com` |
| `agent` | Agent under Admin (Partners, role 2) | `https://admin.example.com` |
| `user` | Player under agent (Users), balance 1000 and 250 points | `https://example.com` |

Section 11 explains how to secure these accounts before going public.

> **Moving data from the old SQL Server database?** Run `npm run migrate:mssql` in `admin-backend` (see `casino-admin/README.md`). Run it **before** the APIs start for the first time against the empty MySQL database. Otherwise the demo seed fills `Partners` and `Users`, and the copy skips those tables.

**Check:** `mysql -h 127.0.0.1 -u casino -p Solution -e 'SELECT 1'` asks for the password and prints `1`.

## 6. Backend environment files

Each API reads its settings from a `.env` file in its own folder. Real environment variables override the file. The `.env.example` next to each file documents every setting.

Rules that matter:

- `NOTIFY_SECRET` **must be exactly the same** in both files. Otherwise live balance updates are rejected (see section 0).
- `JWT_KEY` must be **different** in each file. Players and admins get separate login tokens.
- `HOST=127.0.0.1` keeps each API off the public network. Nginx is the only way in.
- `TRUST_PROXY=loopback` lets the APIs see the real client IP and `https` from Nginx.

As `casino`, create `/opt/casino/casino-user/user-backend/.env`:

```env
HOST=127.0.0.1
PORT=5090
TRUST_PROXY=loopback

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=casino
DB_PASSWORD=the-db-password
DB_NAME=Solution

JWT_KEY=user-api-jwt-key
JWT_ISSUER=UserBackend
JWT_AUDIENCE=UserFrontend
JWT_EXPIRES_HOURS=12

CORS_ORIGINS=https://example.com

# The admin API hosts the wallet hub. NOTIFY_SECRET must equal the admin .env.
ADMIN_BACKEND_URL=http://127.0.0.1:5100
NOTIFY_SECRET=the-shared-notify-secret

FORTUNEGATE_BASE_URL=https://agentapi.fortunegate.net
FORTUNEGATE_TOKEN=the-fortunegate-agent-token
FORTUNEGATE_LANG=1
FORTUNEGATE_RETURN_URL=https://example.com/slot
FORTUNEGATE_DEFAULT_WIN_RATIO=0
FORTUNEGATE_CALLBACK_TOKEN=the-fortunegate-callback-token
```

Create `/opt/casino/casino-admin/admin-backend/.env`:

```env
HOST=127.0.0.1
PORT=5100
TRUST_PROXY=loopback
# Uploaded provider images get URLs under this host.
PUBLIC_BASE_URL=https://admin.example.com

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=casino
DB_PASSWORD=the-db-password
DB_NAME=Solution

JWT_KEY=admin-api-jwt-key-different-from-the-user-one
JWT_ISSUER=AdminBackend
JWT_AUDIENCE=AdminFrontend
JWT_EXPIRES_HOURS=12

# Both sites open the wallet hub, so both origins are listed.
CORS_ORIGINS=https://admin.example.com,https://example.com

NOTIFY_SECRET=the-shared-notify-secret

FORTUNEGATE_BASE_URL=https://agentapi.fortunegate.net
FORTUNEGATE_TOKEN=the-fortunegate-agent-token
FORTUNEGATE_LANG=1
FORTUNEGATE_AGENT_INFO_INTERVAL_SECONDS=5
```

Lock the files down. They hold passwords and tokens:

```bash
chmod 600 /opt/casino/casino-user/user-backend/.env /opt/casino/casino-admin/admin-backend/.env
```

**Check:** both `NOTIFY_SECRET` values match (the command prints `match`):

```bash
a=$(grep '^NOTIFY_SECRET=' /opt/casino/casino-user/user-backend/.env)
b=$(grep '^NOTIFY_SECRET=' /opt/casino/casino-admin/admin-backend/.env)
[ "$a" = "$b" ] && echo match || echo MISMATCH
```

## 7. Install packages and build the frontends

Both frontends already call their API through relative paths (`/api`, `/hubs/wallet`), so Nginx routes the calls to the right API. **No source edits are needed before building.**

> Older versions of this guide said to change `localhost` URLs in four files before building. That step is no longer needed.

Still as `casino`:

```bash
cd /opt/casino/casino-user/user-backend    && npm ci --omit=dev
cd /opt/casino/casino-user/user-frontend   && npm ci && npm run build

cd /opt/casino/casino-admin/admin-backend  && npm ci --omit=dev
cd /opt/casino/casino-admin/admin-frontend && npm ci && npm run build
exit
```

`npm run build` writes the site to `dist/`. Nginx serves that folder directly, so a new build is live as soon as it finishes. Players need one hard refresh (Ctrl+F5) to load the new code.

Optional: to put the wallet hub on a different host than the player site, build the player site with `VITE_WALLET_HUB_URL=https://<host>/hubs/wallet npm run build`. Then add the player site's origin to the admin API's `CORS_ORIGINS`. With the Nginx setup below, you don't need this.

**Check:** `ls /opt/casino/casino-user/user-frontend/dist /opt/casino/casino-admin/admin-frontend/dist` shows an `index.html` and an `assets/` folder in each.

## 8. systemd services

Two services keep the APIs running and restart them after crashes and reboots. In both files, replace the Node path with the output of `command -v node` from section 3.

`/etc/systemd/system/casino-user-api.service`:

```ini
[Unit]
Description=Casino user API
After=network.target mysql.service
Wants=mysql.service

[Service]
WorkingDirectory=/opt/casino/casino-user/user-backend
ExecStart=/home/casino/.nvm/versions/node/v22.23.5/bin/node src/server.js
Restart=always
RestartSec=3
User=casino
Group=casino
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/casino-admin-api.service`:

```ini
[Unit]
Description=Casino admin API
After=network.target mysql.service
Wants=mysql.service

[Service]
WorkingDirectory=/opt/casino/casino-admin/admin-backend
ExecStart=/home/casino/.nvm/versions/node/v22.23.5/bin/node src/server.js
Restart=always
RestartSec=3
User=casino
Group=casino
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

`WorkingDirectory` must be the `user-backend` or `admin-backend` folder, because `src/server.js` and `.env` are read relative to it.

Start them. Start the user API first and give it a moment, because on a brand-new database it creates the tables and the demo accounts:

```bash
sudo chown -R casino:casino /opt/casino
sudo systemctl daemon-reload
sudo systemctl enable --now casino-user-api
sleep 3
sudo systemctl enable --now casino-admin-api
sudo systemctl status casino-user-api casino-admin-api --no-pager
```

**Check:** the logs show both listen lines:

```bash
sudo journalctl -u casino-user-api  -n 5 --no-pager   # User backend listening on http://127.0.0.1:5090
sudo journalctl -u casino-admin-api -n 5 --no-pager   # Admin backend listening on http://127.0.0.1:5100

curl -sS http://127.0.0.1:5090/api/games/settings
# [{"name":"Slots","showEnable":true},{"name":"Live Casino","showEnable":true},{"name":"Sports","showEnable":true}]

curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5090/api/auth/me    # 401 (needs a login, so it's up)
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:5100/hubs/wallet/negotiate?negotiateVersion=1   # 200
```

A `000` from curl means nothing is listening on that port. See section 14.

## 9. Nginx and HTTPS

The wallet hub uses WebSockets, so Nginx needs this map. Put it inside the `http { ... }` block of `/etc/nginx/nginx.conf`, unless a `$connection_upgrade` map already exists there:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

Create `/etc/nginx/sites-available/casino-user.conf`:

```nginx
server {
    listen 80;
    server_name example.com;

    root /opt/casino/casino-user/user-frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:5090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # FortuneGate seamless wallet callbacks.
    location /callback {
        proxy_pass http://127.0.0.1:5090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Live wallet updates: hosted by the ADMIN API (5100), not the user API.
    location /hubs/ {
        proxy_pass http://127.0.0.1:5100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Single-page app: unknown paths (/slot, /money/deposit, ...) get index.html.
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Create `/etc/nginx/sites-available/casino-admin.conf`:

```nginx
server {
    listen 80;
    server_name admin.example.com;

    root /opt/casino/casino-admin/admin-frontend/dist;
    index index.html;
    client_max_body_size 6m;   # provider image uploads (the API caps files at 5 MB)

    location /api/ {
        proxy_pass http://127.0.0.1:5100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /hubs/ {
        proxy_pass http://127.0.0.1:5100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Uploaded provider images.
    location /uploads/ {
        proxy_pass http://127.0.0.1:5100;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable both sites, test the config, and add HTTPS:

```bash
sudo ln -s /etc/nginx/sites-available/casino-user.conf  /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/casino-admin.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default     # optional: drop the Nginx welcome page
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d example.com -d admin.example.com
```

Certbot adds the certificates and the HTTP→HTTPS redirect, and it renews them automatically. To confirm renewal works, run `sudo certbot renew --dry-run`.

Nginx must be able to read the `dist` folders. Section 8's `chown` plus the default permissions are enough. If you get `403 Forbidden`, run `sudo chmod o+x /opt/casino /opt/casino/casino-user /opt/casino/casino-user/user-frontend` (and the same for the admin path).

`web.config` in the frontend folders is only for Windows IIS hosting. Nginx ignores it.

**Check:**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://example.com/                 # 200
curl -sS -o /dev/null -w '%{http_code}\n' https://example.com/slot             # 200 (SPA fallback)
curl -sS -o /dev/null -w '%{http_code}\n' https://example.com/api/auth/me      # 401
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "https://example.com/hubs/wallet/negotiate?negotiateVersion=1"   # 200
curl -sS -o /dev/null -w '%{http_code}\n' https://admin.example.com/           # 200
```

## 10. FortuneGate

In the FortuneGate agent panel:

1. Set the **seamless callback URL** to `https://example.com/callback`.
2. Make sure the **callback token** FortuneGate sends in the `Callback-Token` header equals `FORTUNEGATE_CALLBACK_TOKEN` in the user `.env`.
3. If FortuneGate restricts by IP, whitelist the server's public IP.

The user API calls FortuneGate with `FORTUNEGATE_TOKEN` to launch games. Each callback (bet, win, cancel) updates the player's balance in MySQL and pushes the new value to their screen.

If you change a `.env` value, restart that API: `sudo systemctl restart casino-user-api` (or `casino-admin-api`).

## 11. Final checks and first login

Go through the whole list:

- [ ] `https://example.com` loads, and `user` / `@12345#$%` can sign in. The header shows balance 1,000.00 and points 250.
- [ ] `https://admin.example.com` loads, and `Admin` / `@12345#$%` can sign in. The header shows the Fortune Gate balance and RTP.
- [ ] **Live balance:** keep the player site open, then in the admin panel go to **Members → +$** and pay `user` 1 dollar. The player's header updates within a second, without a refresh.
- [ ] **Refresh:** after any change, F5 on the player site shows the same balance.
- [ ] **Game launch:** on the player site, click any game. A new window opens with the game. A `502` with `Game launch is unavailable right now.` means FortuneGate refused the request. Check `FORTUNEGATE_TOKEN` and section 10.
- [ ] **Game round:** play one spin, switch back to the player tab, and the balance has changed. **Game History** in the admin panel shows the round.
- [ ] **Uploads:** in **Games → Providers**, upload a provider image. Its URL starts with `https://admin.example.com/uploads/`.

### Secure the demo accounts before going public

All demo accounts share a published password.

1. **Create your own super admin** and sign in with it:

   ```bash
   sudo -iu casino
   cd /opt/casino/casino-admin/admin-backend
   npm run create-admin -- yourlogin 'a-strong-password' 'Your Name'
   exit
   ```

2. **Admin and agent:** in the admin panel open **Agents → Agent Tree**, select each one, and use **Change password**. If you don't need the demo `agent`, use **Delete agent** instead. You can't delete an agent that still has sub-agents under it.
3. **Demo player `user`:** the panel can't change a player's password, so deactivate the account. An inactive account can't sign in.

   ```bash
   sudo mysql Solution -e "UPDATE Users SET Status='Inactive' WHERE LoginId='user';"
   ```

## 12. Updating to a new release

As `casino`, pull and rebuild the repo(s) that changed:

```bash
sudo -iu casino

cd /opt/casino/casino-user && git pull
(cd user-backend  && npm ci --omit=dev)
(cd user-frontend && npm ci && npm run build)

cd /opt/casino/casino-admin && git pull
(cd admin-backend  && npm ci --omit=dev)
(cd admin-frontend && npm ci && npm run build)

exit
sudo systemctl restart casino-user-api casino-admin-api
```

What each change needs:

| What changed | Action |
|---|---|
| `*-frontend/src` only | `npm run build` in that frontend. No restart. Players press Ctrl+F5 once. |
| `*-backend/src` | Restart that service. |
| a `.env` file | Restart that service. If you changed `NOTIFY_SECRET`, change it in **both** files and restart **both** services. |
| `package.json` / `package-lock.json` | `npm ci` (with `--omit=dev` for backends), then rebuild or restart. |
| Database schema | Nothing. Each API adds missing tables and columns on startup. |

`git pull` fails if files in the checkout were edited directly on the server. Run `git status` to see them, then commit or discard the edits.

## 13. Backups

All business data (accounts, balances, transactions, game history) lives in MySQL. Uploaded provider images live in `casino-admin/admin-backend/wwwroot/uploads`.

A daily dump that keeps 14 days, as root:

```bash
sudo mkdir -p /var/backups/casino
sudo tee /etc/cron.daily/casino-backup >/dev/null <<'EOF'
#!/bin/sh
set -e
d=$(date +%F)
mysqldump --single-transaction --routines Solution | gzip > /var/backups/casino/solution-$d.sql.gz
tar czf /var/backups/casino/uploads-$d.tgz -C /opt/casino/casino-admin/admin-backend wwwroot/uploads 2>/dev/null || true
find /var/backups/casino -type f -mtime +14 -delete
EOF
sudo chmod +x /etc/cron.daily/casino-backup
sudo /etc/cron.daily/casino-backup && ls -lh /var/backups/casino
```

To restore: `gunzip -c solution-YYYY-MM-DD.sql.gz | sudo mysql Solution`. Stop both services first.

Copy the backups off the server regularly. A backup that only exists on the same disk doesn't protect you if the server is lost.

## 14. Troubleshooting

Logs are the first place to look:

```bash
sudo journalctl -u casino-user-api  -n 50 --no-pager
sudo journalctl -u casino-admin-api -n 50 --no-pager
sudo journalctl -u casino-user-api -f          # follow live while you reproduce the problem
sudo tail -n 50 /var/log/nginx/error.log
```

### A service won't start

| `systemctl status` shows | Meaning | Fix |
|---|---|---|
| `status=217/USER` | `User=`/`Group=` account doesn't exist | `sudo adduser casino`, or fix `User=` and `Group=` |
| `status=203/EXEC` | systemd can't run the Node binary | `ExecStart` must be the `command -v node` path from a `casino` login, not `/root/.nvm/...` |
| `Cannot find module .../src/server.js` | wrong working directory | `WorkingDirectory` = the `user-backend` or `admin-backend` folder |
| `EADDRINUSE` | the port is taken | `sudo ss -ltnp \| grep -E '5090\|5100'`, then stop the other process |
| `Database setup failed` / `ECONNREFUSED 127.0.0.1:3306` | MySQL is down | `sudo systemctl start mysql` |
| `Access denied for user 'casino'` | wrong DB credentials or grants | check `DB_USER`/`DB_PASSWORD`, repeat section 5 |

After fixing a unit file: `sudo systemctl daemon-reload && sudo systemctl restart <service>`.

### The player's balance doesn't update live

1. **Wrong secret.** Look in the user API log for this line:

   ```text
   Wallet push notify for <login> was rejected: HTTP 401.
   ```

   It means `NOTIFY_SECRET` differs between the two `.env` files. Make them identical (the check in section 6), then restart **both** services.
2. **Admin API unreachable.** `Wallet push notify failed for <login>` means the user API can't reach the admin API at all. Check that `casino-admin-api` is running and that `ADMIN_BACKEND_URL=http://127.0.0.1:5100`.
3. **Browser can't connect to the hub.** In the browser, open DevTools → Network → **WS**. You should see a `/hubs/wallet` connection with status **101**. If you don't, the player site's Nginx config is missing the `location /hubs/` block, or the `$connection_upgrade` map is missing (section 9).

Even when live updates fail, a refresh or switching back to the tab shows the correct balance. If a **refresh** also shows an old balance, the frontend build is outdated. Rebuild it (section 7), then press Ctrl+F5.

### Other problems

| Symptom | Fix |
|---|---|
| `502 Bad Gateway` on `/api` | The API behind it is down. Check `systemctl status` and the logs. |
| `404` when refreshing on `/slot` or an admin page | The `location / { try_files ... /index.html; }` block is missing. |
| `403 Forbidden` on the site root | Nginx can't read `dist`. See the permissions note in section 9. |
| Game launch → `Game launch is unavailable right now.` | FortuneGate refused the request. Check `FORTUNEGATE_TOKEN` and the IP whitelist, then restart the user API. |
| Game rounds don't change the balance | FortuneGate can't reach `https://example.com/callback`, or the `Callback-Token` doesn't match `FORTUNEGATE_CALLBACK_TOKEN`. Watch `journalctl -u casino-user-api -f` while you spin. |
| Player can't sign in after signing up | New accounts are `Pending` until an admin approves them (**Members → Waiting Approval**). |
| Provider image upload fails with `413` | The file is over 5 MB, or `client_max_body_size` is missing in the admin Nginx config. |
| Uploaded image URL starts with `http://` or `127.0.0.1` | Set `PUBLIC_BASE_URL=https://admin.example.com` in the admin `.env` and restart. |

## 15. Local development on Windows

The `start-*.ps1` / `.bat` scripts in each repo are for running everything on a developer PC, not for the server.

1. Install Node.js 22+ and MySQL 8+. Create the `Solution` database, or let the APIs create it.
2. Copy `user-backend/.env.example` to `.env` and `admin-backend/.env.example` to `.env`. Set `DB_USER`/`DB_PASSWORD`, and give **both** files the same `NOTIFY_SECRET`. Keep `HOST=localhost`.
3. Start the **admin** side first. It hosts the wallet hub. Run `casino-admin\run.bat`: API on http://localhost:5100, panel on http://localhost:5174.
4. Start the **user** side with `casino-user\start-all.bat`: API on http://localhost:5090, site on http://localhost:5173.

The Vite dev server in `user-frontend` forwards `/api` to port 5090 and `/hubs` to port 5100, so the player site works exactly as it does behind Nginx.

Backend tests: run `npm test` in `user-backend`. Most tests need a throwaway MySQL server. Set `TEST_DB_HOST`, `TEST_DB_PORT` (default 33306), `TEST_DB_USER`, `TEST_DB_PASSWORD`, and `TEST_DB_NAME`. The name must contain `test`, because the tests wipe every table. See `README.md`.
