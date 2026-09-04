const {
    STATUS_BACKGROUNDS,
    STATUS_FONTS,
    renderLatexToPng,
    uploadUnencryptedToWA,
    RichSubMessageType,
    VoipClient,
    ActiveCall,
    CallState,
    sendRichHtml: baileysSendRichHtml
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
    sendRichHtml,
    convertAudioToOgg,
    toPTT
};

