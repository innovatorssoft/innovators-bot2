const { createMessageStoreHandler } = require('@innovatorssoft/baileys');

/**
 * Handle incoming messages upsert event
 * @param {object} client - The WhatsAppClient instance
 * @param {object} update - The message upsert update object
 */
async function handleMessagesUpsert(client, update) {
    // 📝 Store message for the Anti-Delete system
    const storeHandler = createMessageStoreHandler(client.messageStore);
    storeHandler(update);

    // 📢 Emit event that messages were stored
    client.emit('message-stored', update.messages);

    // Increment change counter for auto-save
    client._incrementStoreChangeCount();

    // Save message store to file immediately
    await client.saveMessageStore();

    try {
        if (update.type !== 'notify' || !update.messages?.length) return;
        const [message] = update.messages;
        if (!message || message.key?.fromMe) return;

        // 🚫 Ignore all protocol messages (history sync, security notifications, app state sync, deleted messages, etc.)
        if (message.message?.protocolMessage) return;

        const msg = message.message || {};

        let jid = client._normalizeJid(message.key.remoteJid);

        // Keep the original technical JID as the primary identifier for Signal sessions
        const jidAlt = client._normalizeJid(message.key.remoteJidAlt) || null;
        // Resolve the actual sender (preferring PN over LID)
        const participant = client._normalizeJid(message.key.participant || message.participant) || null;
        const participantAlt = client._normalizeJid(message.key.participantAlt) || null;

        let sender = jid;
        if (jid.endsWith('@g.us') || jid === 'status@broadcast') {
            sender = (participantAlt && participantAlt.endsWith('@s.whatsapp.net'))
                ? participantAlt
                : (participant || jid);
        }

        // Resolve LID to PN for sender if needed
        sender = await client._resolveLidToPn(sender);

        const timestamp = new Date((message.messageTimestamp || Date.now()) * 1000);

        const getText = () =>
            msg.conversation ||
            msg.extendedTextMessage?.text ||
            msg.imageMessage?.caption ||
            msg.videoMessage?.caption ||
            '';

        const getButtonText = () => {
            if (msg.listResponseMessage)
                return msg.listResponseMessage.title || msg.listResponseMessage.description || '';
            if (msg.templateButtonReplyMessage)
                return msg.templateButtonReplyMessage.selectedDisplayText || msg.templateButtonReplyMessage.selectedId || '';
            if (msg.buttonsResponseMessage)
                return msg.buttonsResponseMessage.selectedDisplayText || msg.buttonsResponseMessage.selectedButtonId || '';
            if (msg.interactiveResponseMessage) {
                const i = msg.interactiveResponseMessage;
                return i.listResponse?.title ||
                    i.listResponse?.description ||
                    i.nativeFlowResponse?.response?.reply ||
                    i.reply ||
                    i.buttonReplyMessage?.displayText || '';
            }
            return '';
        };

        const reply = async (text) => client.sock.sendMessage(jid, { text }, { quoted: message, ai: client.ai });

        // ✅ Handle status updates (stories)
        if (jid === 'status@broadcast') {
            client.emit('status', {
                from: sender,
                sender,
                participant,
                participantAlt,
                body: getText(),
                hasMedia: Boolean(msg.imageMessage || msg.videoMessage),
                timestamp,
                key: message.key,
                raw: message,
                // Reply to status
                reply: async (text) => {
                    if (!sender) throw new Error('Missing participant JID');
                    return client.sock.sendMessage(sender, { text }, { quoted: message, ai: client.ai });
                },
                // 👍 Like (react) to status
                like: async (emoji = '❤️') => {
                    if (!sender) throw new Error('Missing participant JID');

                    // Read the message first
                    try {
                        await client.sock.readMessages([message.key]);
                    } catch (readError) {
                        console.error('Error reading status message:', readError);
                    }

                    // Then send the reaction
                    return client.sock.sendMessage(sender, {
                        react: {
                            text: emoji,
                            key: message.key
                        }
                    }, { ai: client.ai });
                }
            });
            return;
        }

        // ✅ Handle normal/chat messages
        const buttonText = getButtonText();
        const body = buttonText || getText() ||
            msg.listResponseMessage?.singleSelectReply?.selectedRowId || '';

        client.emit('message', {
            from: jid,
            fromAlt: jidAlt,
            sender,
            participant,
            participantAlt,
            body,
            hasMedia: Boolean(msg.imageMessage || msg.videoMessage || msg.audioMessage || msg.documentMessage),
            isGroup: jid.endsWith('@g.us'),
            timestamp,
            isButtonResponse: Boolean(buttonText),
            buttonId: msg?.listResponseMessage?.singleSelectReply?.selectedRowId ||
                msg?.templateButtonReplyMessage?.selectedId ||
                msg?.buttonsResponseMessage?.selectedButtonId || null,
            buttonText,
            raw: message,
            reply,
        });
    } catch (err) {
        console.error('Error processing message:', err);
    }
}

module.exports = {
    handleMessagesUpsert
};
