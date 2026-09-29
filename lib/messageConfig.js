import config from '../config.js';

const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: config.newsletterJid,
            newsletterName: config.botName,
            serverMessageId: -1
        }
    }
};

export const getChannelInfo = () => ({
    contextInfo: {
        ...channelInfo.contextInfo,
        forwardedNewsletterMessageInfo: {
            ...channelInfo.contextInfo.forwardedNewsletterMessageInfo
        }
    }
});

export { channelInfo };
