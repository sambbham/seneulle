# Threadly Store — Full Conversation Log

Complete, chronological record of this conversation: every question asked, every command run, every file created, and every decision made — from first deployment through Docker, backups, the webhook/n8n/Telegram/Messenger integration, and the register/checkout bug fix.

**Project:** Threadly / "sensuelle" — clothing store with 360° product views, editable from an admin panel.
**Stack:** Node.js (≥ 18) + Express, static site + JSON file storage (`data/db.json`). No database.
**Repo location (Windows):** `C:\Users\ikalu\Desktop\ftp`
**Remote server:** `ubuntu@100.111.158.99` → app at `/home/ubuntu/sensuelle` (store name: **sensuelle**)

---

## 1. "How do I upload this project to server and start?"

The app is a simple Express + JSON-file-storage site — no database to set up.

**Upload:** everything except `node_modules/` and optionally `data/db.json`:
- `node_modules/` — install on the server instead (`npm install`)
- `data/db.json` — holds live data (products, orders, customers, admin password). Upload it to keep current data; skip it and the server seeds a default catalog on first start.

**Install & start:**
```bash
cd /var/www/threadly   # or wherever you put it
npm install
npm start              # starts on port 3000; PORT env var overrides
```

**Key facts:**
- Node **18+** required.
- Data saves to `data/db.json` on disk — directory must be writable by the server user.
- Default admin password `admin123` (from `js/data.js`) — change it in admin → Settings.
- Session tokens are in-memory → restarts log everyone out (harmless).
- For a real domain: run behind nginx with HTTPS, e.g. `PORT=3000 pm2 start server.js --name threadly`.
- The order webhook URL in server.js comments references `sensuelle.mero.eu.org` — set `webhookUrl` in admin to point at your own server.

---

## 2. "Create a Dockerfile and docker-compose setup"

Created three files. Key decision: **`data/` is NOT baked into the image** (it holds the admin password and customer data) — it's mounted as a volume instead.

### `.dockerignore`
```
node_modules/
.git/
.gitignore
data/
.env
server.log
Dockerfile
docker-compose.yml
.dockerignore
```

### `Dockerfile`
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies first so this layer is cached unless package files change.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.html admin.html server.js ./
COPY css ./css
COPY js ./js
COPY images ./images

# Runs as non-root "node" user; must be able to write the data directory.
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
```

### `docker-compose.yml` (first version)
```yaml
services:
  web:
    build: .
    container_name: threadly-store
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/data"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

**Run:** `docker compose up -d --build` → `http://your-server:3000`, admin at `/admin.html`.

**Notes given:**
- Data persists in `./data/db.json` on the host; upload your existing db.json first to keep current catalog/orders.
- **Linux permissions:** container's `node` user is uid 1000 — if write fails: `sudo chown -R 1000:1000 data`.
- Updates: `docker compose up -d --build` again; data untouched.
- Custom host port: change `"3000:3000"` to e.g. `"8080:3000"`.

---

## 3. "Add a .env-driven config"

`server.js` already reads `PORT` and `DB_PATH` — wired those through compose plus host-side options.

### `.env.example`
```
# Copy this file to .env and adjust values as needed:
#   cp .env.example .env
# Then start with: docker compose up -d --build
#
# Compose reads the .env file in this directory automatically.

# Host port the store is served on: http://your-server:<HOST_PORT>
HOST_PORT=3000

# Port the server listens on inside the container. Leave at 3000 —
# the host port is controlled by HOST_PORT above.
PORT=3000

# Directory on the host that holds the store data (db.json, webhook-events.jsonl).
# Data here persists across container rebuilds and restarts.
DATA_DIR=./data

# Container name (optional — must be unique on the host).
CONTAINER_NAME=threadly-store

# Optional: custom database file path inside the container.
# Keep it under /app/data so it's covered by the DATA_DIR volume mount,
# e.g. /app/data/db.json (default) or /app/data/prod/db.json
DB_PATH=/app/data/db.json
```

### `docker-compose.yml` (final, env-driven)
```yaml
services:
  web:
    build: .
    container_name: ${CONTAINER_NAME:-threadly-store}
    ports:
      - "${HOST_PORT:-3000}:${PORT:-3000}"
    environment:
      - PORT=${PORT:-3000}
      - DB_PATH=${DB_PATH:-/app/data/db.json}
    volumes:
      - ${DATA_DIR:-./data}:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:${PORT:-3000}/api/data"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

Also added `.env` to `.gitignore` and `.dockerignore` (can hold secrets); `.env.example` stays committed.

**Variable table:** `HOST_PORT` (host port, default 3000) · `PORT` (container port, default 3000) · `DATA_DIR` (default `./data`) · `DB_PATH` (default `/app/data/db.json`) · `CONTAINER_NAME` (default `threadly-store`). Compose falls back to defaults if no `.env`.

---

## 4. "How to transfer this project to remote host?"

Three options:

**rsync (best for repeated syncs):**
```bash
rsync -avz --exclude node_modules --exclude .git --exclude server.log \
  ./ ubuntu@your-server:/var/www/threadly/
```

**scp (simple one-off):**
```bash
scp -r index.html admin.html server.js package.json package-lock.json \
  css js images ubuntu@your-server:/var/www/threadly/
```

**git:** clone on the server; `git pull` for updates.

**Two files handled separately:**
- `data/db.json` — live data + plaintext admin password. Upload it (via scp) if you want current data, else let the server seed defaults. Never put it in git.
- `.env` — gitignored; copy it up with scp or create fresh from `.env.example`.

**Then start:** `docker compose up -d --build` or `npm install && npm start` (with `pm2` for durability).

---

## 5. scp failed with "Access is denied" (PowerShell)

User ran (in PowerShell, from `C:\Users\ikalu\Desktop\ftp`):
```powershell
scp -r index.html admin.html server.js package.json package-lock.json \
css js images ubuntu@100.111.158.99:/home/ubuntu/sensuelle
```
Output: `Access is denied. 0 file(s) copied.` repeated 5 times.

**Diagnosis:**
- Verified the project IS in that folder (`/c/Users/ikalu/Desktop/ftp` — all files present).
- **Root cause:** `\` at the end of a line is NOT a line-continuation in PowerShell (that's the backtick `` ` ``). So the first line ran as one command ending in a stray `\`, and the second line ran separately. The `\` became the copy destination = `C:\` root, which normal users can't write → **"Access is denied. 0 file(s) copied."**

**Fix — one single line, no backslash:**
```powershell
scp -r index.html admin.html server.js package.json package-lock.json css js images ubuntu@100.111.158.99:/home/ubuntu/sensuelle
```
- First connection asks `Are you sure you want to continue connecting (yes/no)?` → type `yes`, then the ubuntu password.
- If `scp` is "not recognized": install OpenSSH Client (Settings → Apps → Optional Features) or use **Git Bash** (ships its own scp).
- Multi-line alternative in PowerShell uses the backtick:
  ```powershell
  scp -r index.html admin.html server.js package.json package-lock.json `
    css js images ubuntu@100.111.158.99:/home/ubuntu/sensuelle
  ```
- Upload `data/db.json` separately if keeping existing data.

---

## 6. "Set up a backup routine for data/db.json"

### Code change — atomic writes in `server.js`
Changed `saveDb()` so a crash or concurrent backup never sees a half-written file:
```js
// Write atomically (temp file + rename) so a crash or a concurrent backup
// never observes a half-written db.json.
function saveDb(db) {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tmp = DB_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, DB_PATH);
}
```
(Added `renameSync` to the `node:fs` import.)

### `backup.sh`
```bash
#!/usr/bin/env bash
#
# Threadly store — backup of the store data (db.json + webhook event log).
#
# Usage:  ./backup.sh [DATA_DIR] [BACKUP_DIR] [KEEP]
#   DATA_DIR   Host folder holding db.json (default: ./data)
#   BACKUP_DIR Where timestamped backups go (default: ./backups)
#   KEEP       How many backups to retain (default: 30)
#
# Backups are gzip-compressed and timestamped, e.g.:
#   backups/db-2026-08-17T030000Z.json.gz
#
# Safe to run while the store is live: the server writes db.json atomically
# (temp file + rename), so a backup is always a full, consistent snapshot.

set -euo pipefail

DATA_DIR="${1:-./data}"
BACKUP_DIR="${2:-./backups}"
KEEP="${3:-30}"

if [[ ! -d "$DATA_DIR" ]]; then
  echo "error: data directory not found: $DATA_DIR" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"

# Core store data: products, orders, customers, settings.
if [[ -f "$DATA_DIR/db.json" ]]; then
  gzip -c "$DATA_DIR/db.json" > "$BACKUP_DIR/db-$STAMP.json.gz"
  echo "backed up db.json -> $BACKUP_DIR/db-$STAMP.json.gz"
else
  echo "warning: no db.json in $DATA_DIR — nothing to back up" >&2
fi

# Optional order-webhook event log lives next to the database.
if [[ -f "$DATA_DIR/webhook-events.jsonl" ]]; then
  gzip -c "$DATA_DIR/webhook-events.jsonl" > "$BACKUP_DIR/webhook-events-$STAMP.jsonl.gz"
fi

# Prune old backups, keeping the newest $KEEP of each kind.
ls -1t "$BACKUP_DIR"/db-*.json.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f || true
ls -1t "$BACKUP_DIR"/webhook-events-*.jsonl.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f || true

echo "backup complete: $(ls -1 "$BACKUP_DIR" | wc -l) file(s) in $BACKUP_DIR"
```

Also added `backups/` to `.gitignore`.

### Verification (run locally)
```
syntax OK
backed up db.json -> ./backups/db-2026-08-16T223945Z.json.gz
backup complete: 1 file(s) in ./backups
```
`gzip -t` confirmed the archive is valid; test backups were cleaned up.

### Server setup
```bash
scp backup.sh server.js ubuntu@100.111.158.99:/home/ubuntu/sensuelle/
cd /home/ubuntu/sensuelle
chmod +x backup.sh
./backup.sh ./data ./backups 30          # test manually
crontab -e                                # add:
```
```
0 3 * * * /home/ubuntu/sensuelle/backup.sh /home/ubuntu/sensuelle/data /home/ubuntu/backups 30 >> /home/ubuntu/backups/backup.log 2>&1
```

### Restore (stop the store FIRST — it caches db.json in memory and would overwrite the restore)
```bash
cd /home/ubuntu/sensuelle
docker compose down
gunzip -c /home/ubuntu/backups/db-2026-08-17T030000Z.json.gz > data/db.json
docker compose up -d
```

### Off-server copy (recommended — protects against losing the whole server)
```bash
rsync -av ubuntu@100.111.158.99:/home/ubuntu/backups/ ~/Desktop/backups/
```

---

## 7. "Why didn't Dockerfile, docker-compose.yml, .env.example upload?"

Because the scp command only uploaded the files explicitly listed — those three (plus `backup.sh`, `.dockerignore`, `.gitignore`) were never in the list.

**Fix:** add them to the scp command:
```powershell
scp -r index.html admin.html server.js package.json package-lock.json css js images Dockerfile docker-compose.yml .env.example backup.sh .dockerignore ubuntu@100.111.158.99:/home/ubuntu/sensuelle
```
or use rsync with excludes:
```bash
rsync -avz --exclude node_modules --exclude data --exclude .git --exclude server.log --exclude backups ./ ubuntu@100.111.158.99:/home/ubuntu/sensuelle/
```

**Gotchas:** dotfiles (`.env.example`) are skipped by plain `./*` globs — list them by name. Don't use `scp -r .` without excludes (would push `node_modules/` and `data/db.json`).

---

## 8. "rsync: not recognized" in PowerShell

`rsync` isn't a PowerShell command. Checked this machine: Git for Windows 2.53.0 — **rsync not available even in Git Bash**. Conclusion: stick with `scp` on this machine (full command from section 7), re-run it for updates. For real incremental syncs later, install rsync for Windows or use git-based deployment.

---

## 9. "How to connect n8n webhook?"

The store already has webhook support built in. Mechanics:
- When an order is created, updated, or cancelled, the server POSTs this JSON to `settings.webhookUrl`:
  ```json
  {
    "event": "order.created",   // or order.updated / order.cancelled
    "order": { "orderNumber": "TH-0001", "customer": {...}, "items": [...], "total": 49.99, "status": "pending" },
    "sentAt": "2026-08-17T00:00:00Z"
  }
  ```
- If `webhookSecret` is set, sent as `X-Webhook-Secret` header.
- **Fire-and-forget:** if n8n is unreachable the event is dropped (only logged in `server.log`) — n8n must be reachable from the store's server.

**Steps:**
1. n8n: Webhook trigger node, POST, path e.g. `threadly-order`; copy the **Production URL** (`https://<n8n-host>/webhook/threadly-order`). Local n8n: `http://localhost:5678/webhook/...` only works if the store is on the same machine/network.
2. Store admin → **Webhooks tab** → set **Order webhook URL**; optionally set **Webhook secret**.
3. Test:
   ```bash
   curl -X POST http://localhost:5678/webhook/threadly-order \
     -H "Content-Type: application/json" \
     -H "X-Webhook-Secret: your-secret" \
     -d '{"event":"order.created","order":{"orderNumber":"TH-0001","total":49.99},"sentAt":"2026-08-17T00:00:00Z"}'
   ```
4. In n8n the payload is at the Webhook node output: `{{ $json.event }}`, `{{ $json.order.orderNumber }}`, `{{ $json.order.total }}`, `{{ $json.order.items }}`. Then **activate** the workflow.

**Notes:** reachability is the common failure; self-test without n8n by pointing the URL at the store's own receiver `https://your-domain/api/webhooks/orders` (events show in admin → Webhooks tab).

---

## 10. "Generate a ready-to-import n8n workflow JSON"

Created **`n8n-threadly-order-workflow.json`** (validated: 7 nodes, 4 connections):
1. `Threadly Webhook` — POST, path `threadly-order`, responds immediately
2. `Event is created?` / `Event is updated?` / `Event is cancelled?` — IF nodes on `$json.event`
3. `Summary: created` / `updated` / `cancelled` — Set nodes adding a readable `summary` string

**Import:** n8n → Workflows → Import from File → select the JSON → **activate** → paste Production URL into store admin → Webhooks tab.

**Expressions:** `{{ $json.summary }}`, `{{ $json.order.items }}`, `{{ $json.order.customer }}`, `{{ $json.order.status }}`. Unmatched events silently end the chain.

---

## 11. "Extend the n8n workflow with a Telegram notification node"

Added **`Notify on Telegram`** (n8n-nodes-base.telegram v1.1), fed by all three Summary branches:
- `chatId`: `={{ $env.TELEGRAM_CHAT_ID }}`
- `text`: `={{ $json.summary }}`

Validated: 8 nodes, Telegram node present, 3 incoming connections.

**Telegram setup:**
1. Message **@BotFather** → `/newbot` → copy the token.
2. n8n → Credentials → **Telegram account** → paste token; select it on the node.
3. Chat ID: message the bot, open `https://api.telegram.org/bot<TOKEN>/getUpdates`, copy `chat.id`. Set `TELEGRAM_CHAT_ID` env var — or simply paste the number into the node's `chatId` field.
4. Activate. Expected messages:
   - `🛒 New order TH-0001 — Alice — $49.99 (2 item(s))`
   - `🔄 Order TH-0001 status → shipped`
   - `❌ Order TH-0001 cancelled`

---

## 12. "How to test the workflow?"

**1. From inside n8n:** select the Webhook node → **"Listen for test event"** → n8n shows the test URL (`.../webhook-test/threadly-order`) and a curl command.

**2. curl with realistic payload** (full order shape; repeat with `order.updated` / `order.cancelled` to test all branches):
```bash
curl -X POST https://your-n8n-host/webhook-test/threadly-order \
  -H "Content-Type: application/json" \
  -d '{
    "event": "order.created",
    "order": {
      "id": "test-1",
      "orderNumber": "TH-0001",
      "customer": { "name": "Alice", "address": "123 Main St", "phone": "+1234567890", "paymentMethod": "cod" },
      "items": [ { "id": "p1", "name": "Classic Tee", "price": 24.99, "color": "#94a3b8", "qty": 2 } ],
      "total": 49.98,
      "status": "pending",
      "createdAt": "2026-08-17T00:00:00.000Z"
    },
    "sentAt": "2026-08-17T00:00:00.000Z"
  }'
```

**3. End-to-end through the real store:** activate workflow → set Order webhook URL to production URL → register a customer, place an order on the storefront.

**Troubleshooting:** n8n → Executions (did it run? which node failed?); store `server.log` shows `[webhook] order.created failed → ...`. Use the test URL (`/webhook-test/...`) while developing so real orders don't trigger notifications.

---

## 13. BUG: "Request failed." on user creation and checkout

**Symptom:** both register and checkout reply with the generic message. (Browsing products works.)

**Investigation:**
- `js/app.js` `apiCall()`: `if (!res.ok) throw new Error(data.error || 'Request failed.');` — the generic message appears when the server returns a non-JSON error (e.g. an HTML 500).
- Nothing was running on localhost:3000 at the time.
- **Scratch-DB test** (server with `DB_PATH=/tmp/...`, port 3100): register → **201**, order → **201**. The server code is correct.

**Root cause (deployment environment):** both failing actions **write** to `data/db.json`; read-only browsing works. The server process couldn't write the file (Docker bind-mount ownership / permissions) → unhandled 500 → HTML page → "Request failed."

**Fix on the server:**
```bash
cd /home/ubuntu/sensuelle
sudo chown -R 1000:1000 data     # Docker (container user is uid 1000)
docker compose up -d --build     # redeploy with the new server.js
```
(Plain-node variant: `sudo chown -R $(whoami) data` then restart / `pm2 restart threadly`.)
Verify: `docker compose exec web touch /app/data/write-test && echo writable && docker compose exec web rm /app/data/write-test`

**Code hardening — `server.js`:** added a JSON error handler so future failures show the real reason:
```js
// Convert unexpected handler errors into JSON so the frontend can show the
// real reason instead of a generic "Request failed.".
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});
```
(Placed after the static middleware, before `app.listen`. `node --check server.js` OK.)

---

## 14. "Get notified to Telegram when user orders/updates/cancels order"

Asked which approach (single-choice question); user chose **"Via the n8n workflow"**.

**Go-live checklist:**
1. Fix the server first (section 13) so orders can be placed.
2. Import `n8n-threadly-order-workflow.json`; create bot via @BotFather; add Telegram credential; set chat ID; **activate**; copy Production URL.
3. Store admin → Webhooks tab → Order webhook URL = n8n production URL. (Webhook secret optional: `db.json` has `webhookSecret: "mysecrets"` — the store sends `X-Webhook-Secret: mysecrets`; set n8n Webhook node Authentication → Header Auth to validate it, or leave n8n on "None" and it's ignored.)
4. Verify: place order → 🛒; admin status change → 🔄; cancel → ❌.
5. If nothing arrives: n8n Executions; `server.log` `[webhook] ... failed →` lines.

---

## 15. "Test the full order → Telegram flow with a real order"

**Reachability check:** localhost:3000 up (HTTP 200); remote `http://100.111.158.99:3000` up (store "sensuelle"); no HTTPS on :443.

**Ran the full flow against the live remote server** (authorized by the user):

| Step | Result | Webhook |
|---|---|---|
| Register test customer ("Telegram Flow Test", tg-flow-test@example.com) | 201 ✓ | — (write fix confirmed) |
| Place order **TH-0007** (Breeze Cotton Tee, $24.99) | 201 ✓ | `order.created` |
| Admin login (`admin123456`) | 200 ✓ | — |
| Status → confirmed | 200 ✓ | `order.updated` |
| Customer cancels | 200 ✓ | `order.cancelled` |

Expected Telegram messages:
1. `🛒 New order TH-0007 — Telegram Flow Test — $24.99 (1 item(s))`
2. `🔄 Order TH-0007 status → confirmed`
3. `❌ Order TH-0007 cancelled`

**If missing:** check admin → Webhooks tab URL (production vs test), n8n Executions (red node = Telegram credential/chat ID), and `server.log`.

**Security note given:** admin password on the remote is `admin123456` (close to the default) — change it in admin → Settings.

---

## 16. "How to send notification to Facebook Messenger from n8n?"

**Research findings:** n8n has no standalone built-in "Facebook Messenger" app node anymore — the current documented path is the **Facebook Graph API node** (generic GET/POST to graph.facebook.com), plus triggers. Messenger has real prerequisites: you can only message people who have interacted with your Page.

**One-time Facebook setup:**
1. Create a Facebook **Page**.
2. developers.facebook.com → Create App (Business) → add **Messenger** product.
3. Link the Page → generate a **Page Access Token** (`pages_messaging` permission). Development mode = admins/testers only; **Live mode + app review** needed for real customers.
4. Get the recipient **PSID** (people who messaged the Page): your own by messaging the Page once; customers via a Page webhook (n8n webhook as Messenger callback, `sender.id`).

**In n8n, two options:**
- **Option A — Facebook Graph API node:** POST, node `/me/messages`, body `{"recipient":{"id":"PSID"},"message":{"text":"{{ $json.summary }}"},...}`.
- **Option B — HTTP Request node:** POST `https://graph.facebook.com/v23.0/me/messages?access_token=...` with the same JSON body.

**Message tags (important):** Messenger normally allows replies only within 24h of the user's last message. Use `messaging_type: "MESSAGE_TAG"` with `CONFIRMED_EVENT_UPDATE` (order confirmations/status) or `SHIPPING_UPDATE` (shipments) to notify outside the window.

**Scope note:** alerting yourself = hardcode your PSID, stay in Development mode, no review. Notifying customers = Live mode + app review + per-customer PSIDs.

---

## 17. "Add the Facebook Messenger node to the n8n workflow JSON"

Added **`Notify on Messenger`** as an **HTTP Request node** (v4.2), fanned out from all three Summary branches (alongside Telegram):

```json
{
  "method": "POST",
  "url": "=https://graph.facebook.com/v23.0/me/messages?access_token={{ $env.FB_PAGE_ACCESS_TOKEN }}",
  "sendHeaders": false,
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={\n  \"recipient\": { \"id\": \"{{ $env.FB_PSID }}\" },\n  \"message\": { \"text\": \"{{ $json.summary }}\" },\n  \"messaging_type\": \"MESSAGE_TAG\",\n  \"tag\": \"CONFIRMED_EVENT_UPDATE\"\n}"
}
```

Validated: 9 nodes; both Telegram and Messenger receive from created/updated/cancelled.

**Env vars:** `FB_PAGE_ACCESS_TOKEN`, `FB_PSID` (set on the n8n host or replace in the node).

---

## 18. "Swap the HTTP node for the built-in Facebook Graph API node"

**Research (n8n source, `packages/nodes-base/nodes/Facebook/FacebookGraphApi.node.ts` from GitHub):**
- Properties: `authType` (accessToken | oAuth2), `hostUrl` (graph.facebook.com | graph-video.facebook.com), `httpRequestMethod` (GET/POST/DELETE), `graphApiVersion`, `node` (e.g. `me/messages`), `edge`, `allowUnauthorizedCerts`, `sendBinaryData`, `binaryPropertyName`, `options` (fields / queryParameters / queryParametersJson).
- **The node has NO JSON body field** — it only sends query parameters (+ binary uploads). URI built as `https://<hostUrl>/<version><node>` + edge. Messenger works because Graph API accepts parameters in the query string.
- `nodeVersion` 1.0 → `typeVersion: 1`.

**Swapped the node to:**
```json
{
  "authType": "accessToken",
  "hostUrl": "graph.facebook.com",
  "httpRequestMethod": "POST",
  "graphApiVersion": "v23.0",
  "node": "me/messages",
  "edge": "",
  "options": {
    "queryParameters": {
      "parameter": [
        { "name": "recipient", "value": "={\"id\":\"{{ $env.FB_PSID }}\"}" },
        { "name": "message", "value": "={\"text\":\"{{ $json.summary }}\"}" },
        { "name": "messaging_type", "value": "MESSAGE_TAG" },
        { "name": "tag", "value": "CONFIRMED_EVENT_UPDATE" }
      ]
    }
  }
}
```
Type: `n8n-nodes-base.facebookGraphApi` v1, id `messenger-notify`, name "Notify on Messenger", position [940, 400].

Validated: valid JSON, 9 nodes, POST me/messages v23.0, params recipient/message/messaging_type/tag, connected from all three summaries.

**Config after import:** create the **Facebook Graph API** credential in n8n (paste Page Access Token) and select it on the node (replaces the `FB_PAGE_ACCESS_TOKEN` env var). `FB_PSID` env var still used (or hardcode in the node).

---

## 19. This document

- First created as a summary (`conversation.md`), then rewritten (per request) to contain **everything** from the conversation, in order, with all commands, files, and decisions.

---

## Appendix A — Current `n8n-threadly-order-workflow.json` (verbatim)

```json
{
  "name": "Threadly — Order Events",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "threadly-order",
        "responseMode": "onReceived",
        "responseData": "immediately",
        "options": {}
      },
      "id": "webhook-threadly-order",
      "name": "Threadly Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 300]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict"
          },
          "conditions": [
            {
              "id": "cond-created",
              "leftValue": "={{ $json.event }}",
              "rightValue": "order.created",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ]
        },
        "options": {}
      },
      "id": "if-order-created",
      "name": "Event is created?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [220, 250]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict"
          },
          "conditions": [
            {
              "id": "cond-updated",
              "leftValue": "={{ $json.event }}",
              "rightValue": "order.updated",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ]
        },
        "options": {}
      },
      "id": "if-order-updated",
      "name": "Event is updated?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [220, 520]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict"
          },
          "conditions": [
            {
              "id": "cond-cancelled",
              "leftValue": "={{ $json.event }}",
              "rightValue": "order.cancelled",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ]
        },
        "options": {}
      },
      "id": "if-order-cancelled",
      "name": "Event is cancelled?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [220, 790]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "set-summary-created",
              "name": "summary",
              "value": "=🛒 New order {{ $json.order.orderNumber }} — {{ $json.order.customer ? $json.order.customer.name : 'unknown' }} — ${{ $json.order.total }} ({{ $json.order.items ? $json.order.items.length : 0 }} item(s))",
              "type": "string"
            }
          ]
        },
        "options": {}
      },
      "id": "set-summary-created",
      "name": "Summary: created",
      "type": "n8n-nodes-base.set",
      "typeVersion": 2,
      "position": [460, 100]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "set-summary-updated",
              "name": "summary",
              "value": "=🔄 Order {{ $json.order.orderNumber }} status → {{ $json.order.status }}",
              "type": "string"
            }
          ]
        },
        "options": {}
      },
      "id": "set-summary-updated",
      "name": "Summary: updated",
      "type": "n8n-nodes-base.set",
      "typeVersion": 2,
      "position": [460, 400]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "set-summary-cancelled",
              "name": "summary",
              "value": "=❌ Order {{ $json.order.orderNumber }} cancelled",
              "type": "string"
            }
          ]
        },
        "options": {}
      },
      "id": "set-summary-cancelled",
      "name": "Summary: cancelled",
      "type": "n8n-nodes-base.set",
      "typeVersion": 2,
      "position": [460, 700]
    },
    {
      "parameters": {
        "resource": "message",
        "operation": "sendMessage",
        "chatId": "={{ $env.TELEGRAM_CHAT_ID }}",
        "text": "={{ $json.summary }}",
        "additionalFields": {},
        "options": {}
      },
      "id": "telegram-notify",
      "name": "Notify on Telegram",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.1,
      "position": [720, 400]
    },
    {
      "parameters": {
        "authType": "accessToken",
        "hostUrl": "graph.facebook.com",
        "httpRequestMethod": "POST",
        "graphApiVersion": "v23.0",
        "node": "me/messages",
        "edge": "",
        "options": {
          "queryParameters": {
            "parameter": [
              {
                "name": "recipient",
                "value": "={\"id\":\"{{ $env.FB_PSID }}\"}"
              },
              {
                "name": "message",
                "value": "={\"text\":\"{{ $json.summary }}\"}"
              },
              {
                "name": "messaging_type",
                "value": "MESSAGE_TAG"
              },
              {
                "name": "tag",
                "value": "CONFIRMED_EVENT_UPDATE"
              }
            ]
          }
        }
      },
      "id": "messenger-notify",
      "name": "Notify on Messenger",
      "type": "n8n-nodes-base.facebookGraphApi",
      "typeVersion": 1,
      "position": [940, 400]
    }
  ],
  "connections": {
    "Threadly Webhook": {
      "main": [
        [
          {
            "node": "Event is created?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Event is created?": {
      "main": [
        [
          {
            "node": "Summary: created",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Event is updated?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Event is updated?": {
      "main": [
        [
          {
            "node": "Summary: updated",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Event is cancelled?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Event is cancelled?": {
      "main": [
        [
          {
            "node": "Summary: cancelled",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Summary: created": {
      "main": [
        [
          {
            "node": "Notify on Telegram",
            "type": "main",
            "index": 0
          },
          {
            "node": "Notify on Messenger",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Summary: updated": {
      "main": [
        [
          {
            "node": "Notify on Telegram",
            "type": "main",
            "index": 0
          },
          {
            "node": "Notify on Messenger",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Summary: cancelled": {
      "main": [
        [
          {
            "node": "Notify on Telegram",
            "type": "main",
            "index": 0
          },
          {
            "node": "Notify on Messenger",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "settings": {
    "executionOrder": "v1"
  }
}
```

## Appendix B — Files created/modified in this session

| File | Purpose |
|---|---|
| `Dockerfile` | Production image (node:20-alpine, non-root, data via volume) |
| `docker-compose.yml` | Compose config, `.env`-driven, persistent `./data` |
| `.env.example` | Documented env vars (HOST_PORT, PORT, DATA_DIR, DB_PATH, CONTAINER_NAME) |
| `.dockerignore` / `.gitignore` | Exclusions (node_modules, data, .env, backups, server.log) |
| `backup.sh` | Nightly gzip backups of db.json + webhook log, retention pruning |
| `server.js` | Atomic `saveDb()` (temp+rename) + JSON error middleware |
| `n8n-threadly-order-workflow.json` | n8n workflow: order events → Telegram + Facebook Messenger |
| `conversation.md` | This document |

## Appendix C — Security reminders

- Admin password lives in `data/db.json` (`settings.adminPassword`); remote currently uses `admin123456` — change it.
- Never commit `data/db.json` (customer data, password hashes, webhook secret) and don't bake it into images (already handled via `.dockerignore`).
- Use HTTPS in front of the store in production (e.g. nginx reverse proxy — not yet set up).
