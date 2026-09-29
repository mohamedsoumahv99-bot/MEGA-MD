import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createSessionStore } from '../../lib/sessionStore.js';

const temporaryDirectories = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

describe('session store isolation', () => {
    it('keeps mutable state and settings separate per session', async () => {
        const firstDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slow-xv-a-'));
        const secondDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slow-xv-b-'));
        temporaryDirectories.push(firstDir, secondDir);
        const first = await createSessionStore(firstDir);
        const second = await createSessionStore(secondDir);

        await first.saveSetting('global', 'stealthMode', { enabled: true });
        await first.incrementMessageCount('chat-a', 'user-a');
        first.contacts['user-a@s.whatsapp.net'] = { id: 'user-a@s.whatsapp.net', name: 'A' };

        expect(await second.getSetting('global', 'stealthMode')).toBeNull();
        expect(await second.getMessageCount('chat-a', 'user-a')).toBe(0);
        expect(second.contacts['user-a@s.whatsapp.net']).toBeUndefined();
    });

    it('restores its state from its own directory', async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'slow-xv-persist-'));
        temporaryDirectories.push(directory);
        const original = await createSessionStore(directory);
        await original.saveSetting('global', 'stealthMode', { enabled: true });
        await original.setBotMode('groups');
        await original.incrementMessageCount('group-a', 'user-a');
        await original.writeToFile();

        const restored = await createSessionStore(directory);
        expect(await restored.getSetting('global', 'stealthMode')).toEqual({ enabled: true });
        expect(await restored.getBotMode()).toBe('groups');
        expect(await restored.getMessageCount('group-a', 'user-a')).toBe(1);
    });
});
