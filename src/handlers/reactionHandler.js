/**
 * Handle messages.reaction event
 * @param {object} client - The WhatsAppClient instance
 * @param {Array<object>} reactions - Array of reactions
 */
async function handleMessagesReaction(client, reactions) {
    try {
        for (const reaction of reactions) {
            if (reaction.key?.fromMe) continue;

            // Get the chat JID, preferring PN over LID
            let jid = client._normalizeJid(reaction.key.remoteJid);
            // Use original remoteJid for technical identification
            const jidAlt = client._normalizeJid(reaction.key.remoteJidAlt) || null;

            // Resolve the sender (who reacted), preferring PN over LID
            const participant = client._normalizeJid(reaction.key.participant) || null;
            const participantAlt = client._normalizeJid(reaction.key.participantAlt) || null;

            let sender = jid;
            if (jid.endsWith('@g.us') || jid === 'status@broadcast') {
                sender = (participantAlt && participantAlt.endsWith('@s.whatsapp.net'))
                    ? participantAlt
                    : (participant || jid);
            }

            // Resolve LID to PN for sender if needed
            sender = await client._resolveLidToPn(sender);

            // Emit the reaction event
            client.emit('message-reaction', {
                from: jid,
                fromAlt: jidAlt,
                sender: sender,
                participant: participant,
                participantAlt: participantAlt,
                emoji: reaction.reaction?.text || null,
                isRemoved: !reaction.reaction?.text,
                messageKey: reaction.key,
                timestamp: new Date(),
                raw: reaction
            });
        }
    } catch (error) {
        console.error('Error processing message reaction:', error);
    }
}

module.exports = {
    handleMessagesReaction
};
