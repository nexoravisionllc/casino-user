# Casino setup

Run these steps on the Ubuntu server. Both sites share one machine, one MySQL database named `Solution`, and the Linux user `casino`. The internet only reaches Nginx on ports 80 and 443.

Repositories:

- https://github.com/nexoravisionllc/casino-user.git
- https://github.com/nexoravisionllc/casino-admin.git

| Public site | Repo | Nginx serves | API on localhost |
|---|---|---|---|
| `https://example.com` | `/opt/casino/casino-user` | `user-frontend/dist` | user API `127.0.0.1:5090` |
| `https://admin.example.com` | `/opt/casino/casino-admin` | `admin-frontend/dist` | admin API `127.0.0.1:5100` |

The user site forwards `/api` and `/callback` to port 5090. Both sites forward `/hubs` to port 5100, because the admin API hosts the live wallet connection. The admin site also forwards `/uploads` to port 5100.

Replace `example.com` with the real player domain and `admin.example.com` with the real admin domain everywhere below.

## 1. DNS and packages

Point both names at this server:

```text
example.com        A    <server-ip>
admin.example.com  A    <server-ip>
```

```bash
sudo apt update
sudo apt install -y curl git ca-certificates nginx certbot python3-certbot-nginx mysql-server
sudo systemctl enable --now mysql nginx
```

Open only 80 and 443. Leave 3306, 5090, and 5100 closed.

## 2. The casino user and Node.js 22

The user API requires Node.js 22 or newer. Install nvm as `casino`, not as root. A systemd service cannot use a Node binary that lives under `/root`.

```bash
sudo adduser --disabled-password --gecos "" casino
sudo mkdir -p /opt/casino
sudo chown casino:casino /opt/casino
sudo -iu casino
```

Stay in that shell for the rest of this section:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm install 22
nvm alias default 22
command -v node
node -v
```

Save the path `command -v node` prints. It looks like `/home/casino/.nvm/versions/node/v22.23.5/bin/node`. Every `ExecStart` below must use that exact path.

## 3. Clone both repositories

Still as `casino`. These repositories are private, so this account needs a GitHub login or a personal access token with access to `nexoravisionllc`.

```bash
git clone https://github.com/nexoravisionllc/casino-user.git /opt/casino/casino-user
git clone https://github.com/nexoravisionllc/casino-admin.git /opt/casino/casino-admin
```

Result:

```text
/opt/casino/casino-user/user-backend
/opt/casino/casino-user/user-frontend
/opt/casino/casino-admin/admin-backend
/opt/casino/casino-admin/admin-frontend
```

If an older copy is still running from `/opt/casino-user` or another directory, stop it before continuing. Two services cannot share port 5090 or 5100.

```bash
sudo systemctl disable --now casino-user-api casino-admin-api
```

## 4. MySQL

The user API creates the tables on startup and, when `Users` is empty, inserts three accounts. All three use the password `@12345#$%`:

| Login | Where it signs in |
|---|---|
| `user` | `https://example.com` |
| `agent` | `https://admin.example.com` |
| `Admin` | `https://admin.example.com` |

Change these passwords before the sites are public.

```bash
sudo mysql
```

```sql
CREATE DATABASE IF NOT EXISTS Solution
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'casino'@'127.0.0.1' IDENTIFIED BY 'choose-a-db-password';
GRANT ALL PRIVILEGES ON Solution.* TO 'casino'@'127.0.0.1';
GRANT CREATE ON *.* TO 'casino'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

`CREATE` is required because each API runs `CREATE DATABASE IF NOT EXISTS` when it starts.

## 5. Backend environment

Pick one long random string for `NOTIFY_SECRET` and put that same value in both files. Use a different `JWT_KEY` in each file. `FORTUNEGATE_TOKEN` is required on the user API or game launch returns `{"message":"Game launch is unavailable right now."}`.

`/opt/casino/casino-user/user-backend/.env`:

```env
HOST=127.0.0.1
PORT=5090
TRUST_PROXY=loopback

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=casino
DB_PASSWORD=choose-a-db-password
DB_NAME=Solution

JWT_KEY=replace-with-a-long-random-string
JWT_ISSUER=UserBackend
JWT_AUDIENCE=UserFrontend

CORS_ORIGINS=https://example.com

ADMIN_BACKEND_URL=http://127.0.0.1:5100
NOTIFY_SECRET=replace-with-one-shared-secret

FORTUNEGATE_BASE_URL=https://agentapi.fortunegate.net
FORTUNEGATE_TOKEN=the-agent-token
FORTUNEGATE_LANG=1
FORTUNEGATE_RETURN_URL=https://example.com/slot
FORTUNEGATE_DEFAULT_WIN_RATIO=0
FORTUNEGATE_CALLBACK_TOKEN=the-callback-token
```

`/opt/casino/casino-admin/admin-backend/.env`:

```env
HOST=127.0.0.1
PORT=5100
TRUST_PROXY=loopback
PUBLIC_BASE_URL=https://admin.example.com

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=casino
DB_PASSWORD=choose-a-db-password
DB_NAME=Solution

JWT_KEY=a-different-long-random-string
JWT_ISSUER=AdminBackend
JWT_AUDIENCE=AdminFrontend

CORS_ORIGINS=https://admin.example.com,https://example.com

NOTIFY_SECRET=replace-with-one-shared-secret

FORTUNEGATE_BASE_URL=https://agentapi.fortunegate.net
FORTUNEGATE_TOKEN=the-agent-token
FORTUNEGATE_LANG=1
FORTUNEGATE_AGENT_INFO_INTERVAL_SECONDS=5
```

In the FortuneGate agent panel, set the seamless callback URL to `https://example.com/callback`. The `Callback-Token` header FortuneGate sends must equal `FORTUNEGATE_CALLBACK_TOKEN`.

Restrict the env files:

```bash
chmod 600 /opt/casino/casino-user/user-backend/.env /opt/casino/casino-admin/admin-backend/.env
```

## 6. Point the frontends at the public hosts

The shipped source calls `localhost`. Change these four lines before building. A same-origin path keeps the browser on the site the visitor opened.

`casino-user/user-frontend/src/api/client.js`:

```js
const BASE = '/api';
```

`casino-user/user-frontend/src/realtime/WalletRealtime.jsx`:

```js
const HUB_URL = '/hubs/wallet';
```

`casino-admin/admin-frontend/src/api/client.js`:

```js
export const BASE = '/api';
```

`casino-admin/admin-frontend/src/context/RealtimeContext.jsx`:

```js
const HUB_URL = '/hubs/wallet';
```

Install and build, still as `casino`:

```bash
cd /opt/casino/casino-user/user-backend && npm ci --omit=dev
cd /opt/casino/casino-user/user-frontend && npm ci && npm run build

cd /opt/casino/casino-admin/admin-backend && npm ci --omit=dev
cd /opt/casino/casino-admin/admin-frontend && npm ci && npm run build
exit
```

Nginx will serve the two `dist` directories.

## 7. systemd

Replace the Node path in both units with the output of `command -v node`.

`/etc/systemd/system/casino-user-api.service`:

```ini
[Unit]
Description=Casino user API
After=network.target mysql.service

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

`WorkingDirectory` must be the `user-backend` or `admin-backend` folder. `src/server.js` is inside that folder.

```bash
sudo chown -R casino:casino /opt/casino
sudo systemctl daemon-reload
sudo systemctl enable --now casino-user-api casino-admin-api
sudo systemctl status casino-user-api casino-admin-api
```

A healthy pair logs `User backend listening on http://127.0.0.1:5090` and `Admin backend listening on http://127.0.0.1:5100`.

```bash
curl -sS http://127.0.0.1:5090/api/games/settings
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5100/api/auth/login
```

The admin curl returns `404` or `400` when the process is listening. `000` means it is not.

To add another administrator later:

```bash
sudo -iu casino
cd /opt/casino/casino-admin/admin-backend
npm run create-admin -- yourlogin 'your-password' 'Your Name'
```

## 8. Nginx and HTTPS

Inside the `http` block of `/etc/nginx/nginx.conf`:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

`/etc/nginx/sites-available/casino.conf`:

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

    location /callback {
        proxy_pass http://127.0.0.1:5090;
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

    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    server_name admin.example.com;

    root /opt/casino/casino-admin/admin-frontend/dist;
    index index.html;
    client_max_body_size 6m;

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

```bash
sudo ln -s /etc/nginx/sites-available/casino.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d example.com -d admin.example.com
```

Certbot adds the certificates and the HTTPS redirect. `try_files ... /index.html` is required because both apps use browser routes; a refresh on `/slot` or an admin page would otherwise 404.

## 9. Check

- `https://example.com` loads, and `user` / `@12345#$%` can sign in.
- `https://admin.example.com` loads, and `Admin` / `@12345#$%` can sign in.
- A signed-in player's balance updates without a refresh.
- Launching a game returns a play URL. A 502 body of `{"message":"Game launch is unavailable right now."}` means FortuneGate rejected the call. Check `FORTUNEGATE_TOKEN` in the user `.env`, then `sudo systemctl restart casino-user-api`.
- An uploaded provider image URL starts with `https://admin.example.com/uploads/`.

## Updating a later release

As `casino`:

```bash
cd /opt/casino/casino-user && git pull
cd user-backend && npm ci --omit=dev
cd ../user-frontend && npm ci && npm run build

cd /opt/casino/casino-admin && git pull
cd admin-backend && npm ci --omit=dev
cd ../admin-frontend && npm ci && npm run build
```

Re-apply the four frontend URL edits if `git pull` restores the `localhost` lines. Then:

```bash
sudo systemctl restart casino-user-api casino-admin-api
```

## When a service fails

```bash
sudo journalctl -u casino-user-api -n 40 --no-pager
sudo journalctl -u casino-admin-api -n 40 --no-pager
```

| Status | Meaning | Fix |
|---|---|---|
| `217/USER` | `User=` or `Group=` does not exist | `sudo adduser casino`, then `User=casino` and `Group=casino` |
| `203/EXEC` | systemd cannot run the Node binary | `ExecStart` must be `command -v node` from a `casino` login, not `/root/.nvm/...` |
| `1/FAILURE` and `Cannot find module .../src/server.js` | wrong working directory | set `WorkingDirectory` to `user-backend` or `admin-backend` |
| `1/FAILURE` and `EADDRINUSE` | the port is already taken | `sudo ss -ltnp \| grep -E '5090\|5100'` and stop the other process |
