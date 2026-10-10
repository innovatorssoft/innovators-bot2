const {
    STATUS_BACKGROUNDS,
    STATUS_FONTS,
    renderLatexToPng,
    uploadUnencryptedToWA,
    RichSubMessageType,
    VoipClient,
    ActiveCall,
    CallState,
    monitorPresence: baileysMonitorPresence,
    createPresenceTracker: baileysCreatePresenceTracker,
    formatDuration,
    formatTimeAgo,
    normalizeContactJid,
    sendRichHtml: baileysSendRichHtml,
    voipDiagnostics,
    sanitizeJid,
    summarizeNode
} = require('@innovatorssoft/baileys');

const WhatsAppClient = require('./client/WhatsAppClient');
const Group = require('./structures/Group');
const { convertAudioToOgg, toPTT } = require('./utils/audio');
const { showBanner } = require('./utils/banner');

// Display welcome banner and initialize process title
showBanner();

/**
 * Standalone sendRichHtml function supporting WhatsAppClient instance or Baileys socket
 * @param {object} clientOrSock - WhatsAppClient instance or Baileys socket
 * @param {string} jid - Target JID
 * @param {string|object} options - HTML string or options object { id, title, html, source, trusted_sources, typename, headerText, footer, botJid, mentions }
 * @param {object} [quoted=null] - Optional quoted message
 * @param {object} [additionalOptions={}] - Optional additional options
 * @returns {Promise<object>}
 */
async function sendRichHtml(clientOrSock, jid, options, quoted = null, additionalOptions = {}) {
    if (clientOrSock && typeof clientOrSock.sendRichHtml === 'function') {
        return clientOrSock.sendRichHtml(jid, options, quoted, additionalOptions);
    }
    const sock = clientOrSock?.sock || clientOrSock;
    return baileysSendRichHtml(sock, jid, options, quoted, additionalOptions);
}

/**
 * Standalone monitorPresence function supporting WhatsAppClient instance or Baileys socket
 * @param {object} clientOrSock - WhatsAppClient instance or Baileys socket
 * @param {string|string[]} jid - Target JID or array of JIDs
 * @param {object} [options={}] - Presence tracker options
 * @returns {object} PresenceTracker instance
 */
function monitorPresence(clientOrSock, jid, options = {}) {
    if (clientOrSock && typeof clientOrSock.monitorPresence === 'function') {
        return clientOrSock.monitorPresence(jid, options);
    }
    const sock = clientOrSock?.sock || clientOrSock;
    return baileysMonitorPresence(sock, jid, options);
}

const createPresenceTracker = monitorPresence;

/**
 * Standalone helper to control VoIP diagnostic logging mode
 * @param {boolean|object} enabledOrClient - Boolean flag, or WhatsAppClient instance
 * @param {boolean} [enabled=true] - Boolean flag if client was passed as first arg
 * @returns {boolean} Current diagnostic mode state
 */
function setVoipDiagnosticMode(enabledOrClient = true, enabled = true) {
    if (typeof enabledOrClient === 'boolean') {
        if (voipDiagnostics && typeof voipDiagnostics.setDiagnosticMode === 'function') {
            voipDiagnostics.setDiagnosticMode(enabledOrClient);
        }
        return enabledOrClient;
    }
    if (enabledOrClient && typeof enabledOrClient.setVoipDiagnosticMode === 'function') {
        return enabledOrClient.setVoipDiagnosticMode(enabled);
    }
    if (voipDiagnostics && typeof voipDiagnostics.setDiagnosticMode === 'function') {
        voipDiagnostics.setDiagnosticMode(Boolean(enabled));
    }
    return Boolean(enabled);
}

module.exports = {
    WhatsAppClient,
    Group,
    STATUS_BACKGROUNDS,
    STATUS_FONTS,
    renderLatexToPng,
    uploadUnencryptedToWA,
    RichSubMessageType,
    VoipClient,
    ActiveCall,
    CallState,
    monitorPresence,
    createPresenceTracker,
    formatDuration,
    formatTimeAgo,
    normalizeContactJid,
    sendRichHtml,
    convertAudioToOgg,
    toPTT,
    voipDiagnostics,
    sanitizeJid,
    summarizeNode,
    setVoipDiagnosticMode
};


