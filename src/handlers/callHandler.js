/**
 * Handle incoming call events
 * @param {object} client - The WhatsAppClient instance
 * @param {Array<object>} call - Call data array
 */
async function handleIncomingCall(client, call) {
    try {
        // Extract phone number from LID if available
        for (const callData of call) {
            if (callData.chatId || callData.from) {
                const jid = callData.chatId || callData.from;

                // Resolve LID to PN using the helper method
                const resolvedJid = await client._resolveLidToPn(jid);
                callData.phoneNumber = resolvedJid.split(':')[0].split('@')[0];
            }
        }

        await client.emit('call', call);
    } catch (error) {
        console.error('Error in call handler:', error);
        client.emit('error', error);
    }
}

module.exports = {
    handleIncomingCall
};
