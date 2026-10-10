
// Track per-call state context for idempotency and lifecycle management (Call ID -> IncomingCallContext)
const incomingCalls = new Map();

/**
 * Handle VoIP incoming call session event
 * @param {object} client - The WhatsAppClient instance
 * @param {object} session - CallSession instance from Baileys VoIP engine
 */
async function handleVoipIncomingCall(client, session) {
    try {
        const callId = session?.callId;
        if (!callId) {
            return;
        }

        // Deduplicate duplicate incoming_ringing events per Call ID
        let context = incomingCalls.get(callId);
        if (context || session._hasEmittedIncoming) {
            if (client?.isVoipDiagnosticMode?.() || client?.debugVoip) {
                console.log(`[VoIP] [${callId}] Duplicate incoming_ringing ignored in handleVoipIncomingCall`);
            }
            return;
        }
        session._hasEmittedIncoming = true;

        context = {
            callId,
            state: session.status || 'incoming_ringing',
            createdAt: Date.now()
        };
        incomingCalls.set(callId, context);

        client.lastIncomingSession = session;
        if (!client.incomingCalls) {
            client.incomingCalls = incomingCalls;
        }

        // Auto clean up reference when call ends
        session.on('stateChange', (state) => {
            if (context) context.state = state;
        });
        session.on('ended', () => {
            if (context) context.state = 'ended';
            if (client.lastIncomingSession?.callId === callId) {
                client.lastIncomingSession = null;
            }
            incomingCalls.delete(callId);
        });

        // Emit call.incoming and alias call:incoming on client
        await client.emit('call.incoming', session);
        await client.emit('call:incoming', session);
    } catch (error) {
        console.error('Error in VoIP incoming call handler:', error);
        if (client.listenerCount && client.listenerCount('error') > 0) {
            client.emit('error', error);
        }
    }
}

module.exports = {
    handleVoipIncomingCall
};

