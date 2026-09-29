# SLOW-XV

Professional multi-session WhatsApp automation built on the existing MEGA-MD
command surface and Baileys multi-device. Maintained by **VArnox Tech**.

## What changed

- Every WhatsApp account has an isolated session under `sessions/user_<number>`.
- Credentials, message cache, contacts, settings, and bot mode are persisted per
  session; a broken account cannot overwrite another account's auth state.
- Web Pair is available at `/` and exposes JSON endpoints for pairing, status,
  stopping a session, and health checks.
- Reconnection uses bounded exponential backoff instead of recursive socket
  creation.
- The existing plugin router and command collection are loaded once and reused,
  so existing commands are not silently discarded.
- Shared bot identity and newsletter metadata are defined in `config.js`.

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:5000`, enter an international phone number without the
leading `+`, and enter the displayed WhatsApp pairing code in the WhatsApp
application. A session is restored automatically when the process starts again.

The pairing API is:

```bash
curl -X POST http://localhost:5000/api/pair \
  -H 'content-type: application/json' \
  -d '{"phoneNumber":"224669288332"}'

curl http://localhost:5000/api/sessions
curl http://localhost:5000/health
```

The `POST /api/sessions/:sessionId/stop` endpoint stops a socket without
deleting credentials. Logging out from WhatsApp is treated as a terminal state;
the session directory remains available for an explicit re-pair or inspection.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `BOT_NAME` | `SLOW-XV` | Display identity |
| `OWNER_NUMBER` | `224669288332` | Owner number without `+` |
| `DEVELOPER_NAME` | `VArnox Tech` | Developer label |
| `TIMEZONE` | `Africa/Conakry` | Logs and command output |
| `PORT` | `5000` | Web Pair port |
| `SESSIONS_DIR` | `sessions` | Root for isolated sessions |
| `NEWSLETTER_JID` | `120363424782348922@newsletter` | Central newsletter context |
| `CHANNEL_INVITE_CODE` | `0029Vb7jG2KEawdwHsZiEm1E` | Verified invitation code |
| `CHANNEL_URL` | derived from the code | Public channel URL override |
| `MAX_SESSIONS` | `100` | Safety limit per process |

The channel invitation code is verified from the reference project. Keep
`CHANNEL_URL` configurable until the public URL is independently confirmed.

## Tests and checks

```bash
npm test
npm run lint
```

The repository keeps the original plugin tests and adds the session-oriented
runtime without requiring a live WhatsApp account for unit tests. A real
pairing and reconnect check still requires a WhatsApp account and should be
performed only after setting the environment variables for the deployment.

## Layout

```text
index.js                 process bootstrap and Web Pair server
config.js                SLOW-XV identity and runtime configuration
lib/sessionManager.js    multi-session lifecycle and reconnect policy
lib/sessionStore.js      per-session state persistence
lib/server.js            Web Pair UI and HTTP API
sessions/user_<number>/  auth, metadata, and state for one account
plugins/                 existing command collection
```
