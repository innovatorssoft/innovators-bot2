const {
    parseJid,
    plotJid,
    normalizePhoneToJid
} = require('@innovatorssoft/baileys');

/**
 * Helper method to resolve LID to PN (Phone Number) if available and normalize JID
 * @param {object} client - The WhatsAppClient instance (or store/sock)
 * @param {string} jid - The JID to resolve (could be LID or PN)
 * @returns {Promise<string>} The resolved and normalized PN if LID mapping exists, otherwise the normalized original JID
 */
async function resolveLidToPn(client, jid) {
    if (!jid) return jid;

    // If it's a LID, try to resolve it to PN
    if (jid.endsWith('@lid')) {
        try {
            const phoneNumber = await client.getPNForLID(jid);
            if (phoneNumber) {
                // Normalize the resolved PN by removing device ID
                return normalizeJid(phoneNumber);
            }
            return jid; // Return original LID if no PN found
        } catch (error) {
            console.error('Error resolving LID to PN:', error);
            return jid; // Return original JID on error
        }
    }

    // If it's already a PN or other format, normalize and return
    return normalizeJid(jid);
}

/**
 * Normalize JID by removing device ID suffix (e.g., :0)
 * Converts 923014434335:0@s.whatsapp.net to 923014434335@s.whatsapp.net
 * @param {string} jid - The JID to normalize
 * @returns {string} Normalized JID
 */
function normalizeJid(jid) {
    if (!jid) return jid;

    // Remove device ID (e.g., :0, :1, etc.) from the JID
    // Pattern: number:deviceId@server becomes number@server
    return jid.replace(/:\d+@/, '@');
}

/**
 * Internal helper to handle mentions and the "mention all" flag
 * @param {string[]} mentions - Array of JIDs or keywords like 'all'/'@all'
 * @param {boolean} mentionAll - Explicit mentionAll flag
 * @returns {object} Object containing processed mentions and mentionAll flag
 */
function handleMentions(mentions, mentionAll) {
    let processedMentions = mentions;
    let finalMentionAll = mentionAll;

    if (mentions && Array.isArray(mentions)) {
        processedMentions = mentions
            .filter(jid => jid !== 'all' && jid !== '@all')
            .map(jid => normalizeJid(jid));
        if (mentions.includes('all') || mentions.includes('@all')) {
            finalMentionAll = true;
        }
    }

    return {
        mentions: processedMentions,
        mentionAll: finalMentionAll
    };
}

module.exports = {
    parseJid,
    plotJid,
    normalizePhoneToJid,
    resolveLidToPn,
    normalizeJid,
    handleMentions
};
