const { DisconnectReason, getCurrentSenderInfo } = require('@innovatorssoft/baileys');
const { Boom } = require('@hapi/boom');
const { formatCode } = require('../utils/formatters');
const { handleMessagesUpsert } = require('./messageHandler');
const { handleMessagesUpdate } = require('./updateHandler');
const { handleMessagesReaction } = require('./reactionHandler');
const { handleIncomingCall } = require('./callHandler');
const {
    handleGroupsUpsert,
    handleGroupsUpdate,
    handleGroupParticipantsUpdate
} = require('./groupHandler');

/**
 * Register all event listeners for the Baileys socket
 * @param {object} client - The WhatsAppClient instance
 * @param {object} authState - Authentication state object containing creds
 * @param {Function} saveCreds - Function to save auth credentials
 */
function registerSocketEvents(client, authState, saveCreds) {
    const sock = client.sock;

    // Connection update handler
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (connection === 'close' && client._pairingCodeTimer) {
            clearTimeout(client._pairingCodeTimer);
            client._pairingCodeTimer = null;
        }

        if (qr && client.authmethod === 'qr') {
            client.emit('qr', qr);
        }

        if (connection === 'open') {
            if (client._connectionState !== 'connected') {
                const user = getCurrentSenderInfo(client.sock.authState);
                if (user) {
                    client.isConnected = true;
                    const userInfo = {
                        name: user.pushName || 'Unknown',
                        phone: user.phoneNumber,
                        platform: user.platform || 'Unknown',
                        isOnline: true,
                    };
                    client._connectionState = 'connected';
                    client.emit('connected', userInfo);

                    // Load message store from file
                    await client.loadMessageStore();

                    // Start auto-save
                    client._startAutoSave();
                }
            }
        } else if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) ?
                lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut : true;

            if (client._connectionState !== 'disconnected') {
                client.isConnected = false;
                client._connectionState = 'disconnected';

                // Save message store before disconnecting
                await client.saveMessageStore();

                // Stop auto-save
                client._stopAutoSave();

                client.emit('disconnected', lastDisconnect?.error);
            }

            if (shouldReconnect) {
                client.connect();
            } else if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                await client.reinitialize();
            }
        }

        // Handle pairing code request after connection is established but before login
        if (client.authmethod === 'pairing' && connection === 'connecting' && !authState.creds?.registered) {
            const phoneNumber = client.pairingPhoneNumber;

            if (phoneNumber) {
                try {
                    // Wait a bit for the connection to initialize properly
                    if (client._pairingCodeTimer) {
                        clearTimeout(client._pairingCodeTimer);
                    }

                    client._pairingCodeTimer = setTimeout(async () => {
                        const customCode = "INOVATOR";
                        try {
                            if (!client.sock || client._connectionState === 'disconnected') {
                                const err = new Error('Socket is not available to request pairing code');
                                console.error('Error requesting pairing code:', err);
                                client.emit('error', err);
                                return;
                            }

                            const code = await client.sock.requestPairingCode(phoneNumber, customCode);
                            if (code) {
                                // Emit pairing code event so clients can handle it
                                client.emit('pairing-code', formatCode(code));
                            } else {
                                console.log("❌ Pairing code not found.");
                            }
                        } catch (error) {
                            console.error('Error requesting pairing code:', error);
                            client.emit('error', error);
                        } finally {
                            client._pairingCodeTimer = null;
                        }
                    }, 2000); // Wait 2 seconds before requesting pairing code
                } catch (error) {
                    console.error('Error setting timeout for pairing code:', error);
                    client.emit('error', error);
                }
            }
        }
    });

    // Message upsert
    sock.ev.on('messages.upsert', (update) => handleMessagesUpsert(client, update));

    // Message update (Anti-delete & poll votes)
    sock.ev.on('messages.update', (updates) => handleMessagesUpdate(client, updates));

    // Message reactions
    sock.ev.on('messages.reaction', (reactions) => handleMessagesReaction(client, reactions));

    // Incoming calls
    sock.ev.on('call', (call) => handleIncomingCall(client, call));

    // LID/PN mapping updates
    sock.ev.on('lid-mapping.update', async (update) => {
        try {
            if (update && Object.keys(update).length > 0) {
                client.emit('lid-mapping-update', update);
            }
        } catch (error) {
            console.error('Error processing LID mapping update:', error);
        }
    });

    // Credential updates
    sock.ev.on('creds.update', saveCreds);

    // Group events
    sock.ev.on('groups.upsert', (groups) => handleGroupsUpsert(client, groups));
    sock.ev.on('groups.update', (groups) => handleGroupsUpdate(client, groups));
    sock.ev.on('group-participants.update', (update) => handleGroupParticipantsUpdate(client, update));

    // Contact events
    sock.ev.on('messaging-history.set', ({ contacts: newContacts }) => {
        if (newContacts && newContacts.length > 0) {
            for (const contact of newContacts) {
                client.contactsCache.set(contact.id, contact);
            }
            client.emit('contacts-received', newContacts);
        }
    });

    sock.ev.on('contacts.upsert', (newContacts) => {
        for (const contact of newContacts) {
            client.contactsCache.set(contact.id, contact);
        }
        client.emit('contacts-upsert', newContacts);
    });

    sock.ev.on('contacts.update', (updates) => {
        for (const update of updates) {
            const existing = client.contactsCache.get(update.id) || {};
            client.contactsCache.set(update.id, { ...existing, ...update });
        }
        client.emit('contacts-update', updates);
    });
}

module.exports = {
    registerSocketEvents
};
