import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import chalk from 'chalk';
import config from './config.js';
import { server, PORT } from './lib/server.js';
import { sessionManager } from './lib/sessionManager.js';
import { printLog } from './lib/print.js';
import { writeErrorLog } from './lib/logger.js';

global.botname = config.botName;
global.themeemoji = '•';

const DATA_DEFAULTS = {
    'owner.json': [config.ownerNumber],
    'banned.json': [],
    'premium.json': [],
    'warnings.json': {},
    'notes.json': {},
    'autoAi.json': {},
    'messageCount.json': { isPublic: true, messageCount: {} },
    'userGroupData.json': {
        users: [], groups: [], antilink: {}, antibadword: {}, warnings: {},
        sudo: [], welcome: {}, goodbye: {}, chatbot: {}, autoReaction: false
    },
    'autoStatus.json': { enabled: false },
    'autoread.json': { enabled: false },
    'autotyping.json': { enabled: false },
    'pmblocker.json': { enabled: false },
    'anticall.json': { enabled: false },
    'stealthMode.json': { enabled: false },
    'autoBio.json': { enabled: false, customBio: null },
    'autoReaction.json': { enabled: false },
    'antidelete.json': { enabled: false },
    'antilink.json': {},
    'antibadword.json': {}
};

function ensureRuntimeDirectories() {
    for (const directory of ['data', 'temp', config.sessionsDir]) {
        fs.mkdirSync(path.resolve(directory), { recursive: true });
    }
    for (const [file, value] of Object.entries(DATA_DEFAULTS)) {
        const filePath = path.resolve('data', file);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
        }
    }
}

function configureTempDirectory() {
    const temp = path.resolve('temp');
    process.env.TMPDIR = temp;
    process.env.TEMP = temp;
    process.env.TMP = temp;
    setInterval(() => {
        fs.readdir(temp, (error, files = []) => {
            if (error) return;
            for (const file of files) {
                const filePath = path.join(temp, file);
                fs.stat(filePath, (statError, info) => {
                    if (!statError && Date.now() - info.mtimeMs > 3 * 60 * 60 * 1000) {
                        fs.rm(filePath, { recursive: true, force: true }, () => {});
                    }
                });
            }
        });
    }, 60 * 60 * 1000);
}

function syntaxCheck() {
    for (const directory of [path.resolve('lib'), path.resolve('plugins')]) {
        if (!fs.existsSync(directory)) continue;
        for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.js'))) {
            const filePath = path.join(directory, file);
            try {
                execFileSync(process.execPath, ['--check', filePath], { stdio: 'pipe' });
            } catch (error) {
                console.error(chalk.yellow(`Could not inspect ${filePath}: ${error.message}`));
            }
        }
    }
}

async function main() {
    ensureRuntimeDirectories();
    configureTempDirectory();
    syntaxCheck();

    server.listen(PORT, () => {
        printLog('success', `${config.botName} Web Pair listening on port ${PORT}`);
    });

    try {
        await sessionManager.restore();
        printLog('success', `${config.botName} ready · ${sessionManager.list().length} session(s) loaded`);
    } catch (error) {
        printLog('error', `Session manager startup failed: ${error.message}`);
        writeErrorLog({
            type: 'startup',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }
}

setInterval(() => {
    if (global.gc) global.gc();
    const rss = process.memoryUsage().rss / 1024 / 1024;
    if (rss > 400) printLog('warning', `Memory usage is high (${Math.round(rss)}MB); sessions remain online.`);
}, 60000);

process.on('uncaughtException', (error) => {
    printLog('error', `Uncaught exception: ${error.message}`);
    writeErrorLog({ type: 'uncaughtException', error: error.message, stack: error.stack, timestamp: new Date().toISOString() });
});
process.on('unhandledRejection', (error) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    printLog('error', `Unhandled rejection: ${normalized.message}`);
    writeErrorLog({ type: 'unhandledRejection', error: normalized.message, stack: normalized.stack, timestamp: new Date().toISOString() });
});
server.on('error', (error) => {
    printLog('error', `Server error: ${error.message}`);
    writeErrorLog({ type: 'serverError', error: error.message, stack: error.stack, timestamp: new Date().toISOString() });
});

main();
