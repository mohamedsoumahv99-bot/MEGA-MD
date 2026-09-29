import express from 'express';
import { createServer } from 'http';
import path from 'path';
import config from '../config.js';
import { sessionManager } from './sessionManager.js';

const app = express();
const server = createServer(app);
const PORT = config.port || 5000;

app.use(express.json({ limit: '32kb' }));
app.use('/assets', express.static(path.resolve('assets'), { maxAge: '1h' }));

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
     :root { color-scheme: dark; --bg:#03060b; --panel:#0b111c; --panel-2:#0e1726; --line:#1b3557; --text:#f1f7ff; --muted:#8295ad; --accent:#1687ff; --accent-2:#00c8ff; --danger:#ff6b83; }
     * { box-sizing:border-box; } body { margin:0; min-height:100vh; font-family:Inter,ui-sans-serif,system-ui,sans-serif; color:var(--text); background:radial-gradient(circle at 50% -12%,#123b6c 0,#06101e 32%,var(--bg) 70%); }
     main { width:min(1080px,calc(100% - 32px)); margin:0 auto; padding:34px 0 60px; }
     header { display:flex; justify-content:space-between; gap:28px; align-items:center; margin-bottom:28px; } .brand { width:min(100%,520px); border:1px solid #14528d; border-radius:20px; box-shadow:0 0 38px #087dff22; display:block; margin-bottom:18px; } h1 { margin:0; font-size:clamp(2.2rem,6vw,4.6rem); letter-spacing:-.07em; line-height:.95; } .eyebrow { color:var(--accent-2); font-size:.72rem; font-weight:850; letter-spacing:.18em; text-transform:uppercase; } p { color:var(--muted); line-height:1.55; } .version { align-self:flex-start; border:1px solid var(--line); border-radius:999px; padding:8px 12px; color:var(--accent-2); background:#071322; font-size:.78rem; font-weight:800; }
     .grid { display:grid; grid-template-columns:minmax(280px,360px) 1fr; gap:18px; align-items:start; } .card { background:linear-gradient(145deg,rgba(14,23,38,.96),rgba(6,11,19,.96)); border:1px solid var(--line); border-radius:22px; padding:22px; box-shadow:0 20px 80px #0008; } h2 { margin:0 0 14px; font-size:1.08rem; } label { display:block; color:var(--muted); font-size:.85rem; margin-bottom:7px; } input,button { width:100%; border-radius:12px; border:1px solid var(--line); padding:13px 14px; font:inherit; } input { background:#050a12; color:var(--text); margin-bottom:12px; outline:none; } input:focus { border-color:var(--accent); box-shadow:0 0 0 3px #1687ff22; } button { cursor:pointer; background:linear-gradient(110deg,var(--accent),var(--accent-2)); border-color:var(--accent); color:#00101e; font-weight:900; box-shadow:0 8px 24px #1687ff33; } button.secondary { background:transparent; color:var(--text); border-color:var(--line); box-shadow:none; } button:disabled { opacity:.55; cursor:wait; } .hint { font-size:.8rem; margin:12px 0 0; } .sessions { display:grid; gap:12px; } .session { border:1px solid var(--line); border-radius:16px; padding:16px; background:var(--panel-2); } .session-top { display:flex; justify-content:space-between; gap:12px; } .number { font-weight:800; } .badge { border-radius:999px; padding:4px 9px; font-size:.72rem; font-weight:800; text-transform:uppercase; } .connected { color:#00101e; background:var(--accent-2); } .pairing,.connecting,.reconnecting { color:#00101e; background:#56b7ff; } .error,.logged_out { color:#21080b; background:var(--danger); } .stopped { color:var(--muted); background:#17263c; } .meta { color:var(--muted); font-size:.78rem; margin:8px 0 0; } .actions { display:flex; gap:8px; margin-top:14px; } .actions button { width:auto; flex:1; padding:9px 12px; } .code { margin-top:14px; padding:14px; border-radius:12px; background:#02070d; text-align:center; font:800 1.4rem/1.2 ui-monospace,monospace; letter-spacing:.12em; color:var(--accent-2); border:1px solid #16599b; } .empty { color:var(--muted); border:1px dashed var(--line); border-radius:16px; padding:22px; text-align:center; } footer { margin-top:24px; color:var(--muted); font-size:.8rem; } @media(max-width:760px){ main{padding-top:20px}.grid{grid-template-columns:1fr}header{display:block}.version{display:inline-block;margin-top:16px}header p{max-width:560px} }
  </style>
</head>
<body>
<main>
  <header><div><img class="brand" src="/assets/menu-catbox.jpg" alt="${escapeHtml(config.botName)}"><div class="eyebrow">VArnox Tech · multi-session</div><h1>${escapeHtml(config.botName)}</h1><p>Générateur de code de pairing professionnel. Chaque compte WhatsApp reste isolé, persistant et reconnectable.</p></div><div class="version">v${escapeHtml(config.version)} · WEB PAIR</div></header>
  <section class="grid">
    <div class="card"><h2>Nouvelle session</h2><form id="pair-form"><label for="phone">Numéro WhatsApp international</label><input id="phone" name="phoneNumber" placeholder="224669288332" inputmode="numeric" required><button id="pair-button">Générer le code</button></form><p class="hint">Format international, sans « + », espaces ou tirets. Le code reste associé à ce compte.</p></div>
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

app.post('/api/pair', async (req, res) => {
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
