import fs from 'fs';
import path from 'path';
import { parsePhoneNumber } from 'awesome-phonenumber';
import makeWASocket, {
    Browsers,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidDecode,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState
} from '@whiskeysockets/baileys';
import NodeCache from 'node-cache';
import pino from 'pino';
import QRCode from 'qrcode';
import config from '../config.js';
import { smsg } from './myfunc.js';
import { compileAll } from './compile.js';
import commandHandler from './commandHandler.js';
import { handleCall, handleGroupParticipantUpdate, handleMessages, handleStatus } from './messageHandler.js';
import { createSessionStore } from './sessionStore.js';
import { runWithSessionStore } from './sessionContext.js';
import { printLog } from './print.js';

const silentLogger = pino({ level: 'silent' });

function normalizeNumber(value) {
    const number = String(value || '').replace(/\D/g, '');
    const parsed = parsePhoneNumber(`+${number}`);
    if (!parsed.valid) throw new Error('Invalid international phone number');
    return number;
}

function safeSessionId(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function statusCodeFrom(error) {
    return error?.output?.statusCode || error?.data?.statusCode || error?.statusCode;
}

export class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.pairingRequests = new Map();
        this.root = path.resolve(process.cwd(), config.sessionsDir);
        this.started = false;
        this.commandsReady = false;
        this.versionPromise = null;
    }

    ensureRoot() {
        fs.mkdirSync(this.root, { recursive: true });
    }

    sessionDir(sessionId) {
        return path.join(this.root, safeSessionId(sessionId));
    }

    metadataPath(sessionId) {
        return path.join(this.sessionDir(sessionId), 'metadata.json');
    }

    readMetadata(sessionId) {
        try {
            return JSON.parse(fs.readFileSync(this.metadataPath(sessionId), 'utf8'));
        } catch {
            return null;
        }
    }

    writeMetadata(record) {
        fs.mkdirSync(record.dir, { recursive: true });
        const file = this.metadataPath(record.sessionId);
        const temporary = `${file}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify({
            sessionId: record.sessionId,
            phoneNumber: record.phoneNumber,
            createdAt: record.createdAt,
            updatedAt: new Date().toISOString(),
            status: record.status,
            lastError: record.lastError || null
        }, null, 2));
        fs.renameSync(temporary, file);
    }

    async ensureCommands() {
        if (this.commandsReady) return;
        await compileAll();
        await commandHandler.loadCommands();
        this.commandsReady = true;
    }

    async restore() {
        if (this.started) return;
        this.started = true;
        this.ensureRoot();
        await this.ensureCommands();
        const entries = fs.readdirSync(this.root, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && entry.name.startsWith('user_'));

        for (const entry of entries) {
            const sessionId = entry.name;
            const metadata = this.readMetadata(sessionId);
            if (!metadata?.phoneNumber) continue;
            try {
                await this.start(sessionId, metadata.phoneNumber, { requestPairing: false, restoring: true });
            } catch (error) {
                printLog('error', `Failed to restore ${sessionId}: ${error.message}`);
            }
        }

        if (config.pairingNumber) {
            try {
                await this.pair(config.pairingNumber);
            } catch (error) {
                printLog('error', `Legacy PAIRING_NUMBER could not start: ${error.message}`);
            }
        }
    }

    list() {
        return [...this.sessions.values()].map((record) => ({
            sessionId: record.sessionId,
            phoneNumber: record.phoneNumber,
            status: record.status,
            connected: record.status === 'connected',
            user: record.socket?.user || null,
            lastError: record.lastError || null,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        }));
    }

    get(sessionId) {
        return this.sessions.get(safeSessionId(sessionId));
    }

    findByNumber(phoneNumber) {
        const number = normalizeNumber(phoneNumber);
        return [...this.sessions.values()].find((record) => record.phoneNumber === number);
    }

    async pair(phoneNumber) {
        const number = normalizeNumber(phoneNumber);
        const existing = this.findByNumber(number);
        if (existing?.status === 'connected') {
            return { ...this.publicRecord(existing), pairingCode: null, reused: true };
        }
        if (existing?.status === 'pairing' && this.pairingRequests.has(existing.sessionId)) {
            return this.pairingRequests.get(existing.sessionId);
        }
        if (this.sessions.size >= config.maxSessions && !existing) {
            throw new Error('Maximum active sessions reached');
        }

        const sessionId = existing?.sessionId || `user_${number}`;
        if (existing?.status === 'logged_out') {
            this.clearAuth(existing.dir);
        }
        if (existing?.pairingTimer) {
            clearTimeout(existing.pairingTimer);
            existing.pairingTimer = null;
        }
        const resultPromise = this.start(sessionId, number, { requestPairing: true });
        this.pairingRequests.set(sessionId, resultPromise);
        try {
            return await resultPromise;
        } finally {
            this.pairingRequests.delete(sessionId);
        }
    }

    async start(sessionId, phoneNumber, options = {}) {
        const normalizedId = safeSessionId(sessionId);
        const number = normalizeNumber(phoneNumber);
        let record = this.sessions.get(normalizedId);

        if (record?.socket && ['connecting', 'connected', 'pairing'].includes(record.status)) {
            return this.publicRecord(record);
        }

        record ||= {
            sessionId: normalizedId,
            phoneNumber: number,
            dir: this.sessionDir(normalizedId),
            createdAt: new Date().toISOString(),
            status: options.requestPairing ? 'pairing' : 'connecting',
            reconnectAttempt: 0,
            queue: Promise.resolve(),
            reconnectTimer: null,
            pairingTimer: null,
            manualStop: false,
            saveCredsQueue: Promise.resolve(),
            lastError: null,
            socket: null,
            store: null
        };
        record.phoneNumber = number;
        record.dir = this.sessionDir(normalizedId);
        if (record.socket && !['connecting', 'connected', 'pairing'].includes(record.status)) {
            try {
                record.socket.ws?.close();
                record.socket.end?.(new Error('Replacing stale pairing socket'));
            } catch {
                // The previous socket may already be closed.
            }
            record.socket = null;
        }
        record.manualStop = false;
        record.pairingCode = null;
        record.qr = null;
        record.status = options.requestPairing ? 'pairing' : 'connecting';
        record.updatedAt = new Date().toISOString();
        this.sessions.set(normalizedId, record);
        this.writeMetadata(record);

        const socket = await this.createSocket(record);
        const registered = socket.authState.creds.registered === true;
        if (options.requestPairing && !registered) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            try {
                const pairingCode = await socket.requestPairingCode(number);
                const formatted = pairingCode?.match(/.{1,4}/g)?.join('-') || pairingCode;
                record.pairingCode = formatted;
                record.status = 'pairing';
                record.updatedAt = new Date().toISOString();
                this.writeMetadata(record);
                printLog('success', `Pairing code for ${number}: ${formatted}`);
                record.pairingTimer = setTimeout(() => {
                    if (record.status === 'pairing') {
                        record.status = 'pairing_expired';
                        record.lastError = 'Pairing window expired';
                        record.pairingCode = null;
                        try {
                            record.socket?.ws?.close();
                            record.socket?.end?.(new Error('Pairing window expired'));
                        } catch {
                            // The socket may already be closed.
                        }
                        record.socket = null;
                        this.writeMetadata(record);
                    }
                }, config.pairingTimeoutMs);
                return { ...this.publicRecord(record), pairingCode: formatted };
            } catch (error) {
                record.lastError = error.message;
                record.status = 'error';
                this.writeMetadata(record);
                throw error;
            }
        }
        return this.publicRecord(record);
    }

    async createSocket(record) {
        fs.mkdirSync(record.dir, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(record.dir);
        if (!this.versionPromise) this.versionPromise = fetchLatestBaileysVersion();
        const { version } = await this.versionPromise;
        const sessionStore = await createSessionStore(record.dir);
        const retryCache = new NodeCache();
        const ghostMode = await sessionStore.getSetting('global', 'stealthMode');
        const socket = makeWASocket({
            version,
            logger: silentLogger,
            browser: Browsers.macOS('Chrome'),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, silentLogger)
            },
            markOnlineOnConnect: !ghostMode?.enabled,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            msgRetryCounterCache: retryCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            getMessage: async (key) => {
                const message = await sessionStore.loadMessage(jidNormalizedUser(key.remoteJid), key.id);
                return message?.message || undefined;
            }
        });

        record.socket = socket;
        record.store = sessionStore;
        record.status = state.creds.registered ? 'connecting' : 'pairing';
        socket.authState = { creds: state.creds };
        socket.sessionId = record.sessionId;
        socket.phoneNumber = record.phoneNumber;
        socket.sessionStore = sessionStore;
        socket.store = sessionStore;
        socket.public = true;
        socket.msgRetryCounterCache = retryCache;
        socket.serializeM = (message) => smsg(socket, message, sessionStore);
        socket.decodeJid = (jid) => {
            if (!jid) return jid;
            if (/:\\d+@/i.test(jid)) {
                const decoded = jidDecode(jid) || {};
                return decoded.user && decoded.server ? `${decoded.user}@${decoded.server}` : jid;
            }
            return jid;
        };
        socket.getName = (jid, withoutContact = false) => {
            const id = socket.decodeJid(jid);
            const contact = sessionStore.contacts[id] || {};
            if (withoutContact) return '';
            return contact.name || contact.subject || contact.verifiedName || id.split('@')[0];
        };
        socket.isGhostMode = async () => Boolean((await sessionStore.getSetting('global', 'stealthMode'))?.enabled);

        const originalPresence = socket.sendPresenceUpdate.bind(socket);
        socket.sendPresenceUpdate = async (...args) => {
            if (await socket.isGhostMode()) return;
            return originalPresence(...args);
        };
        const originalRead = socket.readMessages?.bind(socket);
        if (originalRead) {
            socket.readMessages = async (...args) => {
                if (await socket.isGhostMode()) return;
                return originalRead(...args);
            };
        }

        sessionStore.bind(socket.ev);
        socket.ev.on('creds.update', () => {
            record.saveCredsQueue = record.saveCredsQueue
                .then(() => saveCreds())
                .catch((error) => {
                    record.lastError = `credentials: ${error.message}`;
                    printLog('error', `[${record.sessionId}] ${record.lastError}`);
                });
        });
        socket.ev.on('messages.upsert', (update) => this.enqueue(record, () => handleMessages(socket, update)));
        socket.ev.on('group-participants.update', (update) => this.enqueue(record, () => handleGroupParticipantUpdate(socket, update)));
        socket.ev.on('status.update', (status) => this.enqueue(record, () => handleStatus(socket, status)));
        socket.ev.on('messages.reaction', (reaction) => this.enqueue(record, () => handleStatus(socket, reaction)));
        socket.ev.on('call', (calls) => this.enqueue(record, () => handleCall(socket, calls)));
        socket.ev.on('connection.update', (update) => this.onConnectionUpdate(record, update));
        return socket;
    }

    enqueue(record, task) {
        record.queue = record.queue
            .then(() => runWithSessionStore(record.store, task))
            .catch((error) => {
                record.lastError = error.message;
                printLog('error', `[${record.sessionId}] message task: ${error.message}`);
            });
        return record.queue;
    }

    async onConnectionUpdate(record, update) {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            record.lastQr = qr;
            try {
                record.qr = await QRCode.toDataURL(qr);
            } catch {
                record.qr = null;
            }
        }
        if (connection === 'open') {
            record.status = 'connected';
            record.pairingCode = null;
            if (record.pairingTimer) clearTimeout(record.pairingTimer);
            record.pairingTimer = null;
            record.reconnectAttempt = 0;
            record.lastError = null;
            record.updatedAt = new Date().toISOString();
            this.writeMetadata(record);
            printLog('success', `[${record.sessionId}] ${config.botName} connected`);
            try {
                const setbioModule = await import('../plugins/setbio.js');
                const startAutoBio = setbioModule.startAutoBio || setbioModule.default?.startAutoBio;
                if (typeof startAutoBio === 'function') await startAutoBio(record.socket);
            } catch (error) {
                printLog('warning', `[${record.sessionId}] auto bio: ${error.message}`);
            }
        }
        if (connection === 'close') {
            record.socket = null;
            if (record.manualStop) {
                record.status = 'stopped';
                record.updatedAt = new Date().toISOString();
                this.writeMetadata(record);
                return;
            }
            const code = statusCodeFrom(lastDisconnect?.error);
            if (code === DisconnectReason.loggedOut || code === 401) {
                record.status = 'logged_out';
                record.lastError = 'WhatsApp logged out this session';
                record.updatedAt = new Date().toISOString();
                this.writeMetadata(record);
                printLog('warning', `[${record.sessionId}] logged out; credentials kept for inspection`);
                return;
            }
            record.status = 'reconnecting';
            record.reconnectAttempt += 1;
            record.updatedAt = new Date().toISOString();
            this.writeMetadata(record);
            this.scheduleReconnect(record);
        }
    }

    scheduleReconnect(record) {
        if (record.reconnectTimer) return;
        const delay = Math.min(
            config.reconnectMaxDelayMs,
            config.reconnectBaseDelayMs * (2 ** Math.min(record.reconnectAttempt - 1, 5))
        );
        record.reconnectTimer = setTimeout(async () => {
            record.reconnectTimer = null;
            try {
                await this.start(record.sessionId, record.phoneNumber, { requestPairing: false });
            } catch (error) {
                record.lastError = error.message;
                this.scheduleReconnect(record);
            }
        }, delay);
    }

    async stop(sessionId) {
        const record = this.get(sessionId);
        if (!record) throw new Error('Session not found');
        if (record.reconnectTimer) clearTimeout(record.reconnectTimer);
        record.reconnectTimer = null;
        if (record.pairingTimer) clearTimeout(record.pairingTimer);
        record.pairingTimer = null;
        record.manualStop = true;
        record.status = 'stopped';
        if (record.socket) {
            try {
                record.socket.ws?.close();
                record.socket.end?.(new Error('Stopped by operator'));
            } catch {
                // The socket may already be closed.
            }
        }
        await record.store?.writeToFile();
        record.socket = null;
        record.updatedAt = new Date().toISOString();
        this.writeMetadata(record);
        return this.publicRecord(record);
    }

    async shutdown() {
        const records = [...this.sessions.values()];
        await Promise.allSettled(records.map((record) => this.stop(record.sessionId)));
    }

    publicRecord(record) {
        return {
            sessionId: record.sessionId,
            phoneNumber: record.phoneNumber,
            status: record.status,
            connected: record.status === 'connected',
            pairingCode: record.pairingCode || null,
            qr: record.qr || null,
            user: record.socket?.user || null,
            lastError: record.lastError || null,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        };
    }

    clearAuth(directory) {
        if (!fs.existsSync(directory)) return;
        for (const entry of fs.readdirSync(directory)) {
            if (entry === 'metadata.json' || entry === 'state') continue;
            fs.rmSync(path.join(directory, entry), { recursive: true, force: true });
        }
    }
}

export const sessionManager = new SessionManager();
export { normalizeNumber };
