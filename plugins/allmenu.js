import fs from 'fs';
import path from 'path';
import config from '../config.js';
import commandHandler from '../lib/commandHandler.js';
import { channelInfo } from '../lib/messageConfig.js';

function runtime() {
    const totalSeconds = Math.floor(process.uptime());
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function buildMenu(prefix) {
    const blocks = [...commandHandler.categories.entries()].map(([category, commands]) => (
        `╭───⟪ ${category.toUpperCase()} ⟫───╮\n${commands.map((command, index) => `│ ${String(index + 1).padStart(2, '0')} · ${prefix}${command}`).join('\n')}\n╰────────────────────`
    ));
    return [
        `╭──⟪🤖 ${config.botName} ⟫──╮`,
        `│ Owner      : ${config.botOwner}`,
        `│ Developer  : ${config.developerName}`,
        `│ Commands   : ${commandHandler.commands.size}`,
        `│ Uptime     : ${runtime()}`,
        `│ Timezone   : ${config.timeZone}`,
        `╰────────────────────`,
        '',
        ...blocks,
        '',
        `> ${config.botName} · powered by ${config.developerName}`
    ].join('\n');
}

export default {
    command: 'allmenu',
    aliases: ['fullmenu', 'allcommands'],
    category: 'general',
    description: 'Show every command grouped by category',
    usage: '.allmenu',
    async handler(sock, message, _args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const text = buildMenu(config.prefix);
        const imagePath = path.join(process.cwd(), 'assets', 'menu-catbox.jpg');
        if (fs.existsSync(imagePath)) {
            await sock.sendMessage(chatId, { image: { url: imagePath }, caption: text, ...channelInfo }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }
    }
};
