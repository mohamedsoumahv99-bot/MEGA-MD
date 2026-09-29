import config from '../config.js';
import { sessionManager, normalizeNumber } from '../lib/sessionManager.js';
export default {
    command: 'pair',
    aliases: ['paircode', 'session', 'getsession', 'sessionid'],
    category: 'general',
    description: 'Get session id for MEGA-MD',
    usage: '.pair 92305395XXXX',
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const forwardInfo = {
            forwardingScore: 1,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: config.newsletterJid,
                newsletterName: config.botName,
                serverMessageId: -1
            }
        };
        const query = args.join('').trim();
        if (!query) {
            return await sock.sendMessage(chatId, {
                text: "❌ *Missing Number*\nExample: .pair 92305395XXXX",
                contextInfo: forwardInfo
            }, { quoted: message });
        }
        let number;
        try {
            number = normalizeNumber(query);
        } catch {
            return await sock.sendMessage(chatId, {
                text: "❌ *Invalid Format*\nPlease provide the number with country code but without + or spaces.",
                contextInfo: forwardInfo
            }, { quoted: message });
        }
        await sock.sendMessage(chatId, {
            text: "⚡ *Requesting code from server...*",
            contextInfo: forwardInfo
        }, { quoted: message });
        try {
            const result = await sessionManager.pair(number);
            if (result.pairingCode) {
                const pairingCode = result.pairingCode;
                const successText = `✅ *MEGA-MD PAIRING CODE*\n\n` +
                    `Code: *${pairingCode}*\n\n` +
                    `*How to use:*\n` +
                    `1. Open WhatsApp Settings\n` +
                    `2. Tap 'Linked Devices'\n` +
                    `3. Tap 'Link a Device'\n` +
                    `4. Select 'Link with phone number instead'\n` +
                    `5. Enter the code above.`;
                await sock.sendMessage(chatId, {
                    text: successText,
                    contextInfo: forwardInfo
                }, { quoted: message });
            } else if (result.connected) {
                await sock.sendMessage(chatId, {
                    text: `✅ *Session déjà connectée*\n\nLe numéro ${number} est déjà prêt à utiliser ${config.botName}.`,
                    contextInfo: forwardInfo
                }, { quoted: message });
            } else {
                throw new Error(result.lastError || 'Pairing indisponible');
            }
        }
        catch (error) {
            console.error(`[${config.botName}] Pairing plugin error:`, error.message);
            let errorMsg = "❌ *Pairing Failed*\nReason: ";
            errorMsg += error.message || "The server is currently offline or busy. Try again later.";
            await sock.sendMessage(chatId, {
                text: errorMsg,
                contextInfo: forwardInfo
            }, { quoted: message });
        }
    }
};
