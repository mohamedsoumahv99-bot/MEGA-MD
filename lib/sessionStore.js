import fs from 'fs';
import path from 'path';
import globalStore from './lightweight_store.js';

/*
 * The legacy store is still exported for plugins that import it directly.
 * A session gets an object with the same public API, but its mutable memory
 * and JSON files live below its own session directory. This lets the existing
 * command surface keep working while new connections do not share messages,
 * contacts, settings, or bot mode.
 */
export async function createSessionStore(sessionDir) {
    const stateDir = path.join(sessionDir, 'state');
    const store = Object.create(globalStore);
    const storeFile = path.join(stateDir, 'store.json');
    const settingsFile = path.join(stateDir, 'settings.json');

    store.messages = {};
    store.contacts = {};
    store.chats = {};
    store.messageCount = {};
    store.isPublic = true;
    store.botMode = 'public';
    store.settings = {};

    const ensureStateDir = () => fs.mkdirSync(stateDir, { recursive: true });
    const saveJson = (file, value) => {
        ensureStateDir();
        const temporary = `${file}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
        fs.renameSync(temporary, file);
    };

    store.readFromFile = async () => {
        ensureStateDir();
        try {
            if (fs.existsSync(storeFile)) {
                const data = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
                store.contacts = data.contacts || {};
                store.chats = data.chats || {};
                store.messages = data.messages || {};
                store.messageCount = data.messageCount || {};
                store.isPublic = data.isPublic !== false;
                store.botMode = data.botMode || 'public';
            }
            if (fs.existsSync(settingsFile)) {
                store.settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) || {};
            }
        } catch (error) {
            console.warn(`[SESSION STORE] Could not load ${sessionDir}: ${error.message}`);
        }
        return store;
    };

    store.writeToFile = async () => {
        saveJson(storeFile, {
            contacts: store.contacts,
            chats: store.chats,
            messages: store.messages,
            messageCount: store.messageCount,
            isPublic: store.isPublic,
            botMode: store.botMode
        });
        saveJson(settingsFile, store.settings);
    };

    store.bind = (ev) => {
        ev.on('messages.upsert', async ({ messages = [] }) => {
            for (const message of messages) {
                const jid = message?.key?.remoteJid;
                if (!jid) continue;
                const list = store.messages[jid] || [];
                list.push({
                    key: message.key,
                    message: message.message,
                    messageTimestamp: message.messageTimestamp,
                    participant: message.participant,
                    pushName: message.pushName,
                    broadcast: message.broadcast
                });
                store.messages[jid] = list.slice(-20);
            }
        });
        ev.on('contacts.update', (contacts = []) => {
            for (const contact of contacts) {
                if (!contact?.id) continue;
                store.contacts[contact.id] = {
                    id: contact.id,
                    name: contact.notify || contact.name || contact.verifiedName || '',
                    notify: contact.notify,
                    verifiedName: contact.verifiedName
                };
            }
        });
        ev.on('contacts.set', (contacts = []) => {
            for (const contact of contacts) {
                if (!contact?.id) continue;
                store.contacts[contact.id] = {
                    id: contact.id,
                    name: contact.notify || contact.name || contact.verifiedName || '',
                    notify: contact.notify,
                    verifiedName: contact.verifiedName
                };
            }
        });
        ev.on('chats.set', (chats = []) => {
            for (const chat of chats) {
                if (chat?.id) store.chats[chat.id] = { ...chat };
            }
        });
        ev.on('chats.update', (chats = []) => {
            for (const chat of chats) {
                if (chat?.id) store.chats[chat.id] = { ...(store.chats[chat.id] || {}), ...chat };
            }
        });
        ev.on('chats.delete', (chatIds = []) => {
            for (const chatId of chatIds) {
                delete store.chats[chatId];
                delete store.messages[chatId];
            }
        });
    };

    store.loadMessage = async (jid, id) =>
        (store.messages[jid] || []).find((message) => message.key?.id === id) || null;

    store.saveSetting = async (chatId, key, value) => {
        if (!store.settings[key] || typeof store.settings[key] !== 'object') {
            store.settings[key] = {};
        }
        if (chatId === 'global') {
            store.settings[key] = value;
        } else {
            store.settings[key][chatId] = value;
        }
        await store.writeToFile();
    };

    store.getSetting = async (chatId, key) => {
        const value = store.settings[key];
        if (value === undefined) return null;
        if (chatId === 'global' && value?.enabled !== undefined) return value;
        return value?.[chatId] ?? value ?? null;
    };

    store.getAllSettings = async (chatId) => {
        const result = {};
        for (const [key, value] of Object.entries(store.settings)) {
            if (value?.[chatId] !== undefined) result[key] = value[chatId];
            else if (value?.enabled !== undefined) result[key] = value;
        }
        return result;
    };

    store.setBotMode = async (mode) => {
        if (['public', 'private', 'groups', 'inbox', 'self'].includes(mode)) {
            store.botMode = mode;
            await store.writeToFile();
        }
    };
    store.getBotMode = async () => store.botMode || 'public';
    store.incrementMessageCount = async (chatId, userId) => {
        store.messageCount[chatId] ||= {};
        store.messageCount[chatId][userId] = (store.messageCount[chatId][userId] || 0) + 1;
    };
    store.getMessageCount = async (chatId, userId) => store.messageCount[chatId]?.[userId] || 0;
    store.getAllMessageCounts = async () => ({ isPublic: store.isPublic, messageCount: store.messageCount });
    store.setPublicMode = async (isPublic) => {
        store.isPublic = Boolean(isPublic);
        await store.writeToFile();
    };
    store.getPublicMode = async () => store.isPublic;

    await store.readFromFile();
    return store;
}
