import express from 'express';
import { createServer } from 'http';
import path from 'path';
import config from '../config.js';
import { sessionManager } from './sessionManager.js';

const app = express();
const server = createServer(app);
const PORT = config.port || 5000;
const pairAttempts = new Map();
const PAIR_WINDOW_MS = 10 * 60 * 1000;
const MAX_PAIR_ATTEMPTS = 12;

app.use(express.json({ limit: '32kb' }));
app.use('/assets', express.static(path.resolve('assets'), { maxAge: '1h' }));
app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

function allowPairRequest(req, res, next) {
    const now = Date.now();
    const address = req.ip || req.socket.remoteAddress || 'unknown';
    const recent = (pairAttempts.get(address) || []).filter((timestamp) => now - timestamp < PAIR_WINDOW_MS);
    if (recent.length >= MAX_PAIR_ATTEMPTS) {
        return res.status(429).json({ error: 'Too many pairing attempts. Try again in a few minutes.' });
    }
    recent.push(now);
    pairAttempts.set(address, recent);
    if (pairAttempts.size > 1000) {
        for (const [key, timestamps] of pairAttempts) {
            if (!timestamps.some((timestamp) => now - timestamp < PAIR_WINDOW_MS)) pairAttempts.delete(key);
        }
    }
    return next();
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function sendError(res, error, status = 400) {
    res.status(status).json({ error: error?.message || String(error) });
}

app.get('/', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(config.botName)} · Web Pair</title>
    <style>
     :root { color-scheme:dark; --bg:#020408; --panel:#07101c; --panel-2:#0a1727; --line:#123b69; --line-bright:#1764ab; --text:#f4f8ff; --muted:#8da4bf; --accent:#1d8fff; --accent-2:#00d4ff; --danger:#ff6f87; }
     * { box-sizing:border-box; } body { margin:0; min-height:100vh; font-family:Inter,ui-sans-serif,system-ui,sans-serif; color:var(--text); background:radial-gradient(circle at 50% -10%,#0b4280 0,#06101f 28%,var(--bg) 68%); }
     main { width:min(1120px,calc(100% - 32px)); margin:0 auto; padding:30px 0 56px; } header { display:grid; grid-template-columns:minmax(0,1fr) 260px; gap:28px; align-items:center; margin-bottom:22px; } .brand-frame { position:relative; overflow:hidden; border:1px solid var(--line-bright); border-radius:22px; background:#000; box-shadow:0 0 42px #087dff2e; } .brand { width:100%; display:block; aspect-ratio:2/1; object-fit:cover; } .brand-frame:after { content:""; position:absolute; inset:auto 0 0; height:42%; background:linear-gradient(transparent,#020408); pointer-events:none; } .eyebrow { color:var(--accent-2); font-size:.72rem; font-weight:850; letter-spacing:.2em; text-transform:uppercase; } h1 { margin:7px 0 0; font-size:clamp(2.4rem,7vw,5.4rem); letter-spacing:-.08em; line-height:.9; text-shadow:0 0 26px #1687ff55; } p { color:var(--muted); line-height:1.55; } .intro { max-width:690px; margin:16px 0 0; } .version { justify-self:end; align-self:start; border:1px solid var(--line-bright); border-radius:999px; padding:9px 13px; color:var(--accent-2); background:#061425; font-size:.72rem; font-weight:850; letter-spacing:.1em; white-space:nowrap; }
     .grid { display:grid; grid-template-columns:minmax(280px,360px) 1fr; gap:18px; align-items:start; } .card { background:linear-gradient(145deg,rgba(10,23,39,.97),rgba(3,8,14,.97)); border:1px solid var(--line); border-radius:20px; padding:22px; box-shadow:0 20px 80px #000a; } h2 { margin:0 0 14px; font-size:1.08rem; } label { display:block; color:var(--muted); font-size:.85rem; margin-bottom:7px; } input,button { width:100%; border-radius:12px; border:1px solid var(--line); padding:13px 14px; font:inherit; } input { background:#03070d; color:var(--text); margin-bottom:12px; outline:none; } input:focus { border-color:var(--accent); box-shadow:0 0 0 3px #1687ff22; } button { cursor:pointer; background:linear-gradient(110deg,var(--accent),var(--accent-2)); border-color:var(--accent); color:#00101e; font-weight:900; box-shadow:0 8px 24px #1687ff33; transition:transform .18s ease,filter .18s ease; } button:hover { filter:brightness(1.12); transform:translateY(-1px); } button.secondary { background:transparent; color:var(--text); border-color:var(--line); box-shadow:none; } button:disabled { opacity:.55; cursor:wait; transform:none; } .hint { font-size:.8rem; margin:12px 0 0; } .sessions { display:grid; gap:12px; } .session { border:1px solid var(--line); border-radius:16px; padding:16px; background:var(--panel-2); } .session-top { display:flex; justify-content:space-between; gap:12px; } .number { font-weight:800; } .badge { border-radius:999px; padding:4px 9px; font-size:.72rem; font-weight:800; text-transform:uppercase; } .connected { color:#00101e; background:var(--accent-2); } .pairing,.connecting,.reconnecting { color:#00101e; background:#56b7ff; } .error,.logged_out,.pairing_expired { color:#21080b; background:var(--danger); } .stopped { color:var(--muted); background:#17263c; } .meta { color:var(--muted); font-size:.78rem; margin:8px 0 0; } .actions { display:flex; gap:8px; margin-top:14px; } .actions button { width:auto; flex:1; padding:9px 12px; } .code { margin-top:14px; padding:14px; border-radius:12px; background:#02070d; text-align:center; font:800 1.4rem/1.2 ui-monospace,monospace; letter-spacing:.12em; color:var(--accent-2); border:1px solid #16599b; } .empty { color:var(--muted); border:1px dashed var(--line); border-radius:16px; padding:22px; text-align:center; } footer { margin-top:24px; color:var(--muted); font-size:.8rem; } @media(max-width:760px){ main{padding-top:20px}.grid{grid-template-columns:1fr}header{display:block}.version{display:inline-block;margin-top:16px}.brand-frame{margin-bottom:18px}header p{max-width:560px} }
  </style>
</head>
<body>
<main>
  <header><div><div class="brand-frame"><img class="brand" src="/assets/menu-catbox.jpg" alt="${escapeHtml(config.botName)}"></div><div class="eyebrow">VARNOX-XD · multi-device control</div><h1>${escapeHtml(config.botName)}</h1><p class="intro">Un espace de pairing rapide pour connecter plusieurs comptes WhatsApp. Chaque session reste isolée, suivie et reconnectable.</p></div><div class="version">v${escapeHtml(config.version)} · SECURE PAIR</div></header>
  <section class="grid">
    <div class="card"><h2>Nouvelle session</h2><form id="pair-form"><label for="phone">Numéro WhatsApp international</label><input id="phone" name="phoneNumber" placeholder="224669288332" inputmode="numeric" autocomplete="tel" required><button id="pair-button">Générer le code</button></form><p class="hint">Format international, sans « + », espaces ou tirets. Le code reste associé à ce compte.</p></div>
    <div class="card"><h2>Sessions actives</h2><div id="sessions" class="sessions"><div class="empty">Chargement…</div></div></div>
  </section>
  <footer>Newsletter : ${escapeHtml(config.newsletterJid)} · Fuseau : ${escapeHtml(config.timeZone)}</footer>
</main>
<script>
const sessions = document.querySelector('#sessions');
const form = document.querySelector('#pair-form');
const button = document.querySelector('#pair-button');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(items) {
  if (!items.length) { sessions.innerHTML = '<div class="empty">Aucune session enregistrée.</div>'; return; }
  sessions.innerHTML = items.map(item => '<article class="session"><div class="session-top"><div class="number">' + esc(item.phoneNumber) + '</div><span class="badge ' + esc(item.status) + '">' + esc(item.status) + '</span></div><div class="meta">ID : ' + esc(item.sessionId) + (item.user?.name ? ' · ' + esc(item.user.name) : '') + '</div>' + (item.pairingCode ? '<div class="code">' + esc(item.pairingCode) + '</div>' : '') + (item.lastError ? '<div class="meta" style="color:var(--danger)">' + esc(item.lastError) + '</div>' : '') + (item.status !== 'stopped' && item.status !== 'logged_out' ? '<div class="actions"><button class="secondary" onclick="stopSession(\\'' + esc(item.sessionId) + '\\')">Arrêter</button></div>' : '') + '</article>').join('');
}
async function refresh() { const response = await fetch('/api/sessions'); render(await response.json()); }
async function stopSession(id) { await fetch('/api/sessions/' + encodeURIComponent(id) + '/stop', {method:'POST'}); await refresh(); }
form.addEventListener('submit', async (event) => { event.preventDefault(); button.disabled = true; button.textContent = 'Connexion…'; try { const response = await fetch('/api/pair', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phoneNumber:form.phoneNumber.value})}); const body = await response.json(); if (!response.ok) throw new Error(body.error); await refresh(); alert(body.pairingCode ? 'Code : ' + body.pairingCode : 'Session démarrée.'); form.reset(); } catch (error) { alert(error.message); } finally { button.disabled = false; button.textContent = 'Générer le code'; } });
refresh(); setInterval(refresh, 5000);
</script>
</body></html>`);
});

app.get('/health', (_req, res) => {
    const memory = process.memoryUsage();
    res.json({
        status: 'ok',
        bot: config.botName,
        version: config.version,
        uptime: Math.floor(process.uptime()),
        sessions: sessionManager.list(),
        memory: { rss: Math.round(memory.rss / 1024 / 1024), heapUsed: Math.round(memory.heapUsed / 1024 / 1024) },
        timestamp: new Date().toISOString()
    });
});

app.get('/api/sessions', (_req, res) => res.json(sessionManager.list()));

app.post('/api/pair', allowPairRequest, async (req, res) => {
    try {
        if (!req.body?.phoneNumber) return res.status(400).json({ error: 'phoneNumber is required' });
        res.json(await sessionManager.pair(req.body.phoneNumber));
    } catch (error) {
        sendError(res, error);
    }
});

app.get('/api/sessions/:sessionId', (req, res) => {
    const record = sessionManager.get(req.params.sessionId);
    if (!record) return res.status(404).json({ error: 'Session not found' });
    res.json(sessionManager.publicRecord(record));
});

app.post('/api/sessions/:sessionId/stop', async (req, res) => {
    try {
        res.json(await sessionManager.stop(req.params.sessionId));
    } catch (error) {
        sendError(res, error, 404);
    }
});

app.get('/chat', async (req, res) => {
    try {
        const record = req.query.sessionId ? sessionManager.get(req.query.sessionId) : sessionManager.list().find((item) => item.connected) && sessionManager.findByNumber(sessionManager.list().find((item) => item.connected).phoneNumber);
        if (!record?.socket) return res.status(404).json({ error: 'Connected session not found' });
        if (!req.query.message || !req.query.to) return res.status(400).json({ error: 'message and to are required' });
        await record.socket.sendMessage(req.query.to, { text: String(req.query.message) });
        res.json({ status: 'sent', sessionId: record.sessionId });
    } catch (error) {
        sendError(res, error);
    }
});

export { app, server, PORT };
