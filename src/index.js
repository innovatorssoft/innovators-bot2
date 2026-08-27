const {
    STATUS_BACKGROUNDS,
    STATUS_FONTS,
    renderLatexToPng,
    uploadUnencryptedToWA,
    RichSubMessageType
} = require('@innovatorssoft/baileys');

const WhatsAppClient = require('./client/WhatsAppClient');
const Group = require('./structures/Group');
const { convertAudioToOgg, toPTT } = require('./utils/audio');
const { showBanner } = require('./utils/banner');

// Display welcome banner and initialize process title
showBanner();

module.exports = {
    WhatsAppClient,
    Group,
    STATUS_BACKGROUNDS,
    STATUS_FONTS,
    renderLatexToPng,
    uploadUnencryptedToWA,
    RichSubMessageType,
    convertAudioToOgg,
    toPTT
};
