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

/**
 * Handle VoIP incoming call session event
 * @param {object} client - The WhatsAppClient instance
 * @param {object} session - CallSession instance from Baileys VoIP engine
 */
async function handleVoipIncomingCall(client, session) {
    try {
        client.lastIncomingSession = session;

        // Auto clean up reference when call ends
        session.on('ended', () => {
            if (client.lastIncomingSession?.callId === session.callId) {
                client.lastIncomingSession = null;
            }
        });

        // Emit call.incoming and alias call:incoming on client
        await client.emit('call.incoming', session);
        await client.emit('call:incoming', session);
    } catch (error) {
        console.error('Error in VoIP incoming call handler:', error);
        client.emit('error', error);
    }
}

module.exports = {
    handleIncomingCall,
    handleVoipIncomingCall
};

