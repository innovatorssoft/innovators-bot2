const {
    makeWASocket,
    Browsers,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadMediaMessage,
    getCurrentSenderInfo,
    // JID Utilities
    parseJid,
    plotJid,
    normalizePhoneToJid,
    // Anti-Delete
    MessageStore,
    createMessageStoreHandler,
    createAntiDeleteHandler,
    createTypingIndicator,
    generateInteractiveButtonMessage,
    generateInteractiveListMessage,
    generateCombinedButtons,
    generateCopyCodeButton,
    generateUrlButtonMessage,
    generateQuickReplyButtons,
    StatusHelper,
    STATUS_BACKGROUNDS,
    STATUS_FONTS,
    renderLatexToPng,
    uploadUnencryptedToWA,
    RichSubMessageType,
    getAggregateVotesInPollMessage
} = require('@innovatorssoft/baileys');

const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { Boom } = require('@hapi/boom');
const { EventEmitter } = require('events');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const mime = require('mime');
const figlet = require('figlet');
const NodeCache = require('node-cache');

process.title = 'INNOVATORS Soft WhatsApp Server +447498792682'

console.log(figlet.textSync('WELCOME To'))
console.log(figlet.textSync('INNOVATORS'))
console.log(figlet.textSync('SOFT'))

class Group {
    constructor(client, groupData) {
        this.client = client
        this.id = groupData.id
        this.notify = groupData.notify
        this.subject = groupData.subject
        this.creation = groupData.creation
        this.owner = groupData.owner
        this.desc = groupData.desc
        this.participants = groupData.participants
    }
}

class WhatsAppClient extends EventEmitter {
    constructor(config = {}) {
        super()
        this.sock = null
        this.isConnected = false
        this.sessionName = config.sessionName || 'auth_info_baileys'
        this._connectionState = 'disconnected'
        this.authmethod = config.authmethod || 'qr';
        this._reconnectDelay = 5000;
        this.pairingPhoneNumber = config.pairingPhoneNumber || null;
        this.groupMetadataCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
        this.messageStore = new MessageStore({
            maxMessagesPerChat: config.maxMessagesPerChat || 1000,
            ttl: config.messageTTL || 24 * 60 * 60 * 1000
        });
        // Initialize contacts cache
        this.contactsCache = new NodeCache({ stdTTL: 0, checkperiod: 20 }); // No TTL, manual cleanup on logout

        // Message store persistence configuration
        this.messageStoreFilePath = config.messageStoreFilePath || path.join(this.sessionName, 'message-store.json');
        this.autoSaveInterval = config.autoSaveInterval || 5 * 60 * 1000; // Default: 5 minutes
        this._autoSaveTimer = null;
        this._storeChangeCount = 0;
        this._pairingCodeTimer = null;
        this._lastStoreSave = null;
        this.ai = config.ai === undefined ? true : config.ai;
    }

    /**
     * Helper method to resolve LID to PN (Phone Number) if available and normalize JID
     * @param {string} jid - The JID to resolve (could be LID or PN)
     * @returns {Promise<string>} The resolved and normalized PN if LID mapping exists, otherwise the normalized original JID
     * @private
     */
    async _resolveLidToPn(jid) {
        if (!jid) return jid;

        // If it's a LID, try to resolve it to PN
        if (jid.endsWith('@lid')) {
            try {
                const phoneNumber = await this.getPNForLID(jid);
                if (phoneNumber) {
                    // Normalize the resolved PN by removing device ID
                    return this._normalizeJid(phoneNumber);
                }
                return jid; // Return original LID if no PN found
            } catch (error) {
                console.error('Error resolving LID to PN:', error);
                return jid; // Return original JID on error
            }
        }

        // If it's already a PN or other format, normalize and return
        return this._normalizeJid(jid);
    }

    /**
     * Normalize JID by removing device ID suffix (e.g., :0)
     * Converts 923014434335:0@s.whatsapp.net to 923014434335@s.whatsapp.net
     * @param {string} jid - The JID to normalize
     * @returns {string} Normalized JID
     * @private
     */
    _normalizeJid(jid) {
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
     * @private
     */
    _handleMentions(mentions, mentionAll) {
        let processedMentions = mentions;
        let finalMentionAll = mentionAll;

        if (mentions && Array.isArray(mentions)) {
            processedMentions = mentions
                .filter(jid => jid !== 'all' && jid !== '@all')
                .map(jid => this._normalizeJid(jid));
            if (mentions.includes('all') || mentions.includes('@all')) {
                finalMentionAll = true;
            }
        }

        return {
            mentions: processedMentions,
            mentionAll: finalMentionAll
        };
    }

    async connect() {
        try {
            if (this._connectionState === 'connecting' && this.sock) {
                return; // Prevent concurrent connection attempts
            }

            if (this._connectionState !== 'connecting') {
                this._connectionState = 'connecting';
                this.emit('connecting', 'Connecting to WhatsApp...');
            }

            const { version: baileysVersion, isLatest: baileysIsLatest } = await fetchLatestBaileysVersion();
            console.log('Using Baileys Version:', baileysVersion, baileysIsLatest ? ' isLatest true' : ' isLatest false');

            const { state, saveCreds } = await useMultiFileAuthState(this.sessionName)
            const logger = P({ level: 'silent' })

            this.sock = makeWASocket({
                auth: state,
                logger,
                markOnlineOnConnect: false,
                syncFullHistory: false,
                getMessage: async (key) => {
                    const msg = this.messageStore.getOriginalMessage(key);
                    if (!msg) {
                        console.log(`Message not found for key: ${JSON.stringify(key)}`);
                        return undefined;
                    }
                    return msg.message;
                },
                generateHighQualityLinkPreview: true,
                linkPreviewImageThumbnailWidth: 192,
                emitOwnEvents: true,
                browser: Browsers.android('Innovators Soft'),
                version: baileysVersion,
                cachedGroupMetadata: async (jid) => {
                    const cached = this.groupMetadataCache.get(jid);
                    if (cached) {
                        return cached;
                    }
                    try {
                        const metadata = await this.sock.groupMetadata(jid);
                        this.groupMetadataCache.set(jid, metadata);
                        return metadata;
                    } catch (error) {
                        console.error(`Error fetching metadata for group ${jid}:`, error);
                        return null;
                    }
                },
            });

            this.store = this.sock.signalRepository.lidMapping;

            this.sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
                if (connection === 'close' && this._pairingCodeTimer) {
                    clearTimeout(this._pairingCodeTimer);
                    this._pairingCodeTimer = null;
                }

                if (qr && this.authmethod === 'qr') {
                    this.emit('qr', qr);
                }
                if (connection === 'open') {
                    if (this._connectionState !== 'connected') {
                        const user = getCurrentSenderInfo(this.sock.authState)
                        if (user) {
                            this.isConnected = true;
                            const userInfo = {
                                name: user.pushName || 'Unknown',
                                phone: user.phoneNumber,
                                platform: user.platform || 'Unknown',
                                isOnline: true,
                            };
                            this._connectionState = 'connected';
                            this.emit('connected', userInfo);

                            // Load message store from file
                            await this.loadMessageStore();

                            // Start auto-save
                            this._startAutoSave();
                        }
                    }
                }
                else if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error instanceof Boom) ?
                        lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut : true;

                    if (this._connectionState !== 'disconnected') {
                        this.isConnected = false;
                        this._connectionState = 'disconnected';

                        // Save message store before disconnecting
                        await this.saveMessageStore();

                        // Stop auto-save
                        this._stopAutoSave();

                        this.emit('disconnected', lastDisconnect?.error);
                    }

                    if (shouldReconnect) {
                        this.connect();
                    } else if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                        await this.reinitialize();
                    }
                }

                // Handle pairing code request after connection is established but before login
                if (this.authmethod === 'pairing' && connection === 'connecting' && !state.creds?.registered) {
                    const phoneNumber = this.pairingPhoneNumber;

                    if (phoneNumber) {
                        try {
                            // Wait a bit for the connection to initialize properly
                            if (this._pairingCodeTimer) {
                                clearTimeout(this._pairingCodeTimer);
                            }

                            this._pairingCodeTimer = setTimeout(async () => {
                                const customeCode = "INOVATOR";
                                try {
                                    if (!this.sock || this._connectionState === 'disconnected') {
                                        const err = new Error('Socket is not available to request pairing code');
                                        console.error('Error requesting pairing code:', err);
                                        this.emit('error', err);
                                        return;
                                    }

                                    const code = await this.sock.requestPairingCode(phoneNumber, customeCode);
                                    if (code) {
                                        // Emit pairing code event so clients can handle it
                                        this.emit('pairing-code', formatCode(code));
                                    } else {
                                        console.log("❌ Pairing code not found.");
                                    }
                                } catch (error) {
                                    console.error('Error requesting pairing code:', error);
                                    this.emit('error', error);
                                } finally {
                                    this._pairingCodeTimer = null;
                                }
                            }, 2000); // Wait 2 seconds before requesting pairing code
                        } catch (error) {
                            console.error('Error setting timeout for pairing code:', error);
                            this.emit('error', error);
                        }
                    }
                }
            })

            /**
             * Handle incoming messages
             * @emits WhatsAppClient#message - When a new message is received
             * @param {object} update - The message update object
             */

            this.sock.ev.on('messages.upsert', async (update) => {
                // 📝 Store message for the Anti-Delete system
                const storeHandler = createMessageStoreHandler(this.messageStore);
                storeHandler(update);

                // 📢 Emit event that messages were stored
                this.emit('message-stored', update.messages);

                // Increment change counter for auto-save
                this._incrementStoreChangeCount();

                // Save message store to file immediately
                await this.saveMessageStore();

                /*console.log('-'.repeat(50));
                console.dir(update, { depth: null });
                console.log('-'.repeat(50));*/

                try {
                    if (update.type !== 'notify' || !update.messages?.length) return;
                    const [message] = update.messages;
                    if (!message || message.key?.fromMe) return;

                    // 🚫 Ignore all protocol messages (history sync, security notifications, app state sync, deleted messages, etc.)
                    if (message.message?.protocolMessage) return;

                    const msg = message.message || {};

                    let jid = this._normalizeJid(message.key.remoteJid);

                    // Keep the original technical JID as the primary identifier for Signal sessions
                    // remoteJidAlt can be used if needed, but not to replace the primary jid for technical replies
                    const jidAlt = this._normalizeJid(message.key.remoteJidAlt) || null;
                    // Resolve the actual sender (preferring PN over LID)
                    const participant = this._normalizeJid(message.key.participant || message.participant) || null;
                    const participantAlt = this._normalizeJid(message.key.participantAlt) || null;

                    let sender = jid;
                    if (jid.endsWith('@g.us') || jid === 'status@broadcast') {
                        sender = (participantAlt && participantAlt.endsWith('@s.whatsapp.net'))
                            ? participantAlt
                            : (participant || jid);
                    }

                    // Resolve LID to PN for sender if needed
                    sender = await this._resolveLidToPn(sender);

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

                    const reply = async (text) => this.sock.sendMessage(jid, { text }, { quoted: message, ai: this.ai });

                    // ✅ Handle status updates (stories)
                    if (jid === 'status@broadcast') {
                        this.emit('status', {
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
                                return this.sock.sendMessage(sender, { text }, { quoted: message, ai: this.ai });
                            },
                            // 👍 Like (react) to status
                            like: async (emoji = '❤️') => {
                                if (!sender) throw new Error('Missing participant JID');

                                // Read the message first
                                try {
                                    await this.sock.readMessages([message.key]);
                                } catch (readError) {
                                    console.error('Error reading status message:', readError);
                                }

                                // Then send the reaction
                                return this.sock.sendMessage(sender, {
                                    react: {
                                        text: emoji,
                                        key: message.key
                                    }
                                }, { ai: this.ai });
                            }
                        });
                        return;
                    }

                    // ✅ Handle normal/chat messages
                    const buttonText = getButtonText();
                    const body = buttonText || getText() ||
                        msg.listResponseMessage?.singleSelectReply?.selectedRowId || '';

                    this.emit('message', {
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
            });

            // 🛡️ Anti-Delete System: Handle message revokes/deletions
            const antiDeleteHandler = createAntiDeleteHandler(this.messageStore);

            this.sock.ev.on('messages.update', async (updates) => {
                const deletedMessages = antiDeleteHandler(updates);
                for (const info of deletedMessages) {
                    let jid = this._normalizeJid(info.key.remoteJid);
                    // Use original remoteJid for technical identification
                    const jidAlt = this._normalizeJid(info.key.remoteJidAlt) || null;

                    this.emit('message-deleted', {
                        jid: jid,
                        jidAlt: jidAlt,
                        originalMessage: info.originalMessage,
                        key: info.key
                    });
                }

                // Handle Poll Updates
                for (const updateObj of updates) {
                    const { key, update } = updateObj;
                    if (update.pollUpdates) {
                        try {
                            const pollCreation = this.messageStore.getOriginalMessage(key);
                            if (pollCreation) {
                                // Initialize pollUpdates array on the stored message if it doesn't exist
                                if (!pollCreation.pollUpdates) {
                                    pollCreation.pollUpdates = [];
                                }

                                // Merge new updates by voter JID to ensure only the latest vote per voter is stored
                                for (const newUp of update.pollUpdates) {
                                    const voterJid = newUp.pollUpdateMessageKey?.participant || (newUp.pollUpdateMessageKey?.fromMe ? 'me' : null);
                                    if (voterJid) {
                                        const normVoterJid = voterJid === 'me' ? 'me' : this._normalizeJid(voterJid);
                                        const index = pollCreation.pollUpdates.findIndex(existing => {
                                            const existingVoter = existing.pollUpdateMessageKey?.participant || (existing.pollUpdateMessageKey?.fromMe ? 'me' : null);
                                            const normExisting = existingVoter === 'me' ? 'me' : this._normalizeJid(existingVoter);
                                            return normExisting === normVoterJid;
                                        });
                                        if (index !== -1) {
                                            pollCreation.pollUpdates[index] = newUp; // Replace with latest vote update from this voter
                                        } else {
                                            pollCreation.pollUpdates.push(newUp); // Add new voter's update
                                        }
                                    }
                                }

                                const pollUpdate = getAggregateVotesInPollMessage({
                                    message: pollCreation.message || pollCreation,
                                    pollUpdates: pollCreation.pollUpdates,
                                });

                                // Resolve JID from LID to PN for voters in the poll update
                                const resolvedPollUpdate = await Promise.all(
                                    pollUpdate.map(async (option) => {
                                        const resolvedVoters = await Promise.all(
                                            (option.voters || []).map(async (v) => {
                                                if (v === 'me') return 'me';
                                                return await this._resolveLidToPn(v);
                                            })
                                        );
                                        return {
                                            ...option,
                                            voters: resolvedVoters
                                        };
                                    })
                                );

                                let jid = this._normalizeJid(key.remoteJid);
                                jid = await this._resolveLidToPn(jid);
                                const jidAlt = this._normalizeJid(key.remoteJidAlt) || null;

                                // Clone key to resolve LIDs to PNs without mutating the original reference if it's read-only
                                const resolvedKey = { ...key };
                                if (key.remoteJid) {
                                    resolvedKey.remoteJid = await this._resolveLidToPn(key.remoteJid);
                                }
                                if (key.participant) {
                                    resolvedKey.participant = await this._resolveLidToPn(key.participant);
                                }

                                // Clone pollCreation to resolve LIDs to PNs without mutating the original store reference
                                const resolvedPollCreation = { ...pollCreation };
                                if (pollCreation.participant) {
                                    resolvedPollCreation.participant = await this._resolveLidToPn(pollCreation.participant);
                                }
                                if (pollCreation.key) {
                                    resolvedPollCreation.key = { ...pollCreation.key };
                                    if (pollCreation.key.remoteJid) {
                                        resolvedPollCreation.key.remoteJid = await this._resolveLidToPn(pollCreation.key.remoteJid);
                                    }
                                    if (pollCreation.key.participant) {
                                        resolvedPollCreation.key.participant = await this._resolveLidToPn(pollCreation.key.participant);
                                    }
                                }

                                // Extract and resolve voter JID(s) from the pollUpdates
                                const voters = await Promise.all(
                                    (update.pollUpdates || []).map(async (u) => {
                                        const voterJid = u.pollUpdateMessageKey?.participant || (u.pollUpdateMessageKey?.fromMe ? 'me' : null);
                                        if (voterJid && voterJid !== 'me') {
                                            return await this._resolveLidToPn(this._normalizeJid(voterJid));
                                        }
                                        return voterJid;
                                    })
                                ).then(arr => arr.filter(Boolean));

                                this.emit('poll-votes-update', {
                                    jid: jid,
                                    jidAlt: jidAlt,
                                    voter: voters[0] || null,
                                    voters: voters,
                                    key: resolvedKey,
                                    pollUpdate: resolvedPollUpdate,
                                    pollCreationMessage: resolvedPollCreation
                                });
                            } else {
                                console.log('[PollVotes] Could not find poll creation message in store for key:', key.id);
                            }
                        } catch (err) {
                            console.error('[PollVotes ERROR] Error processing poll updates:', err);
                        }
                    }
                }
            });

            // 👍 Handle message reactions
            this.sock.ev.on('messages.reaction', async (reactions) => {


                try {
                    for (const reaction of reactions) {
                        if (reaction.key?.fromMe) continue;

                        // Get the chat JID, preferring PN over LID
                        let jid = this._normalizeJid(reaction.key.remoteJid);
                        // Use original remoteJid for technical identification
                        const jidAlt = this._normalizeJid(reaction.key.remoteJidAlt) || null;

                        // Resolve the sender (who reacted), preferring PN over LID
                        const participant = this._normalizeJid(reaction.key.participant) || null;
                        const participantAlt = this._normalizeJid(reaction.key.participantAlt) || null;

                        let sender = jid;
                        if (jid.endsWith('@g.us') || jid === 'status@broadcast') {
                            sender = (participantAlt && participantAlt.endsWith('@s.whatsapp.net'))
                                ? participantAlt
                                : (participant || jid);
                        }

                        // Resolve LID to PN for sender if needed
                        sender = await this._resolveLidToPn(sender);

                        // Emit the reaction event
                        this.emit('message-reaction', {
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
            });

            // Handle incoming calls
            this.sock.ev.on('call', async (call) => {
                try {
                    // Extract phone number from LID if available
                    for (const callData of call) {
                        if (callData.chatId || callData.from) {
                            const jid = callData.chatId || callData.from;

                            // Resolve LID to PN using the helper method
                            const resolvedJid = await this._resolveLidToPn(jid);
                            callData.phoneNumber = resolvedJid.split(':')[0].split('@')[0];
                        }
                    }

                    await this.emit('call', call);
                } catch (error) {
                    console.error('Error in call handler:', error);
                    this.emit('error', error);
                }
            });

            // Handle LID/PN mapping updates
            this.sock.ev.on('lid-mapping.update', async (update) => {
                try {
                    // Store the mapping for future use
                    if (update && Object.keys(update).length > 0) {
                        // The update object contains PN -> LID mappings
                        // They are automatically stored in sock.signalRepository.lidMapping
                        this.emit('lid-mapping-update', update);
                    }
                } catch (error) {
                    console.error('Error processing LID mapping update:', error);
                }
            });

            // Handle credential updates
            this.sock.ev.on('creds.update', saveCreds);

            // Handle group events to keep the cache updated
            this.sock.ev.on('groups.upsert', (groups) => {
                for (const group of groups) {
                    this.updateGroupMetadataCache(group.id, group);
                }
            });

            this.sock.ev.on('groups.update', (groups) => {
                for (const group of groups) {
                    // Get existing cache and update it with new information
                    const cached = this.groupMetadataCache.get(group.id);
                    if (cached) {
                        // Merge the updated fields with existing cached data
                        const updated = { ...cached, ...group };
                        this.updateGroupMetadataCache(group.id, updated);
                    }
                }
            });

            this.sock.ev.on('group-participants.update', async (update) => {
                // When participants change, refresh the group metadata
                try {
                    const metadata = await this.sock.groupMetadata(update.id);
                    this.updateGroupMetadataCache(update.id, metadata);
                } catch (error) {
                    // Check if group no longer exists or bot was removed (404 item-not-found)
                    const isNotFound = error.data === 404 ||
                        error.message?.includes('item-not-found') ||
                        error.output?.statusCode === 404;

                    if (isNotFound) {
                        // Group no longer exists or bot was removed - clean up cache
                        this.clearGroupMetadataCache(update.id);
                        this.emit('group-left', {
                            id: update.id,
                            reason: 'Group not found or bot was removed'
                        });
                    } else {
                        console.error(`Error refreshing metadata for group ${update.id}:`, error);
                    }
                }
            });

            // Handle contacts from history sync
            this.sock.ev.on('messaging-history.set', ({ contacts: newContacts }) => {
                if (newContacts && newContacts.length > 0) {
                    for (const contact of newContacts) {
                        this.contactsCache.set(contact.id, contact);
                    }
                    this.emit('contacts-received', newContacts);

                }
            });

            // Handle contacts upsert (new contacts added)
            this.sock.ev.on('contacts.upsert', (newContacts) => {
                for (const contact of newContacts) {
                    this.contactsCache.set(contact.id, contact);
                }
                this.emit('contacts-upsert', newContacts);
            });

            // Handle contacts update (profile picture changes, etc.)
            this.sock.ev.on('contacts.update', (updates) => {
                for (const update of updates) {
                    const existing = this.contactsCache.get(update.id) || {};
                    this.contactsCache.set(update.id, { ...existing, ...update });
                }
                this.emit('contacts-update', updates);
            });

        } catch (error) {
            console.error('Error in connect:', error);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Send a message to a chat
     * @param {string} chatId - The ID of the chat to send the message to
     * @param {string|object} message - The message content (string) or message object
     * @param {object} options - Additional options for sending the message
     * @returns {Promise<object>} The sent message info
     * @throws {Error} If client is not connected or message sending fails
     */
    async sendMessage(chatId, message, options = {}) {
        chatId = this._normalizeJid(chatId);
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        let messageContent = {};

        // Check if poll is provided in message or options
        let pollData = null;
        if (message && typeof message === 'object' && message.poll) {
            pollData = message.poll;
        } else if (options && options.poll) {
            pollData = options.poll;
        }

        if (pollData) {
            messageContent = {
                poll: {
                    name: pollData.name,
                    values: pollData.values || pollData.options || [],
                    selectableCount: pollData.selectableCount !== undefined ? pollData.selectableCount : (pollData.selectableOptionsCount !== undefined ? pollData.selectableOptionsCount : 1),
                    toAnnouncementGroup: pollData.toAnnouncementGroup || false
                }
            };
        } else if (typeof message === 'string') {
            messageContent = { text: message };
        } else if (message && typeof message === 'object') {
            if (message.richResponse) {
                if (Array.isArray(message.richResponse)) {
                    // Route array of submessages to sendRichMessage instead
                    return await this.sendRichMessage(chatId, message.richResponse, options.quoted || null, { ...options, useMarkdown: true });
                }
                messageContent = { richResponse: message.richResponse };
            } else {
                // Handle different message types
                switch (message.type) {
                    case 'text':
                        messageContent = { text: message.text };
                        const { mentions: textMentions, mentionAll: textMentionAll } = this._handleMentions(message.mentions, message.mentionAll);
                        if (textMentions) messageContent.mentions = textMentions;
                        if (textMentionAll !== undefined) messageContent.mentionAll = textMentionAll;
                        break;

                    case 'location':
                        messageContent = {
                            location: {
                                degreesLatitude: message.latitude,
                                degreesLongitude: message.longitude,
                                name: message.name,
                                address: message.address
                            }
                        };
                        break;

                    case 'contact':
                        messageContent = {
                            contacts: {
                                displayName: message.fullName,
                                contacts: [{
                                    displayName: message.fullName,
                                    vcard: `BEGIN:VCARD\nVERSION:3.0\n` +
                                        `FN:${message.fullName}\n` +
                                        (message.organization ? `ORG:${message.organization};\n` : '') +
                                        (message.phoneNumber ? `TEL;type=CELL;type=VOICE;waid=${message.phoneNumber}:+${message.phoneNumber}\n` : '') +
                                        'END:VCARD'
                                }]
                            }
                        };
                        break;

                    case 'reaction':
                        messageContent = {
                            react: {
                                text: message.emoji,
                                key: message.messageKey || message.message?.key || message.key
                            }
                        };
                        break;

                    default:
                        throw new Error('Invalid message type');
                }
            }
        } else {
            throw new Error('Invalid message content');
        }

        try {
            return await this.sock.sendMessage(chatId, messageContent, { ai: this.ai, ...options });
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    /**
     * Send a media file to a chat
     * @param {string} chatId - The ID of the chat to send the media to
     * @param {string} filePath - Path to the media file
     * @param {object} options - Additional options for the media message
     * @returns {Promise<object>} The sent message info
     * @throws {Error} If client is not connected or file not found
     */
    async sendMedia(chatId, filePath, options = {}) {
        chatId = this._normalizeJid(chatId);
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            let fileBuffer;
            let fileExtension;
            let isUrl = false;

            try {
                const parsedUrl = new URL(filePath);
                isUrl = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
            } catch (_) { }

            if (isUrl) {
                const response = await fetch(filePath);
                if (!response.ok) {
                    throw new Error(`Failed to fetch media from URL: ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                fileBuffer = Buffer.from(arrayBuffer);
                const contentType = response.headers.get('content-type');
                if (contentType) {
                    const cleanMime = contentType.split(';')[0].trim();
                    fileExtension = '.' + mime.getExtension(cleanMime);
                } else {
                    const parsedUrl = new URL(filePath);
                    fileExtension = path.extname(parsedUrl.pathname).toLowerCase();
                }
            } else {
                // Check if file exists
                if (!fs.existsSync(filePath)) {
                    throw new Error('File not found: ' + filePath);
                }
                fileBuffer = fs.readFileSync(filePath);
                fileExtension = path.extname(filePath).toLowerCase();
            }

            const caption = options.caption || '';
            let mediaMessage = {};

            // Handle different media types
            switch (fileExtension) {
                case '.gif':
                case '.mp4':
                    mediaMessage = {
                        video: fileBuffer,
                        caption: caption,
                        gifPlayback: options.asGif || fileExtension === '.gif',
                    }
                    break;

                // Handle audio files
                case '.mp3':
                case '.ogg':
                case '.wav':
                    mediaMessage = {
                        audio: fileBuffer,
                        mimetype: 'audio/mp4',
                    };
                    break;

                // Handle image files
                case '.jpg':
                case '.jpeg':
                case '.png':
                    mediaMessage = {
                        image: fileBuffer,
                        caption: caption,
                    };
                    break;

                default:
                    throw new Error('Unsupported file type: ' + fileExtension);
            }

            const { mentions: mediaMentions, mentionAll: mediaMentionAll } = this._handleMentions(options.mentions, options.mentionAll);
            if (mediaMentions) mediaMessage.mentions = mediaMentions;
            if (mediaMentionAll !== undefined) mediaMessage.mentionAll = mediaMentionAll;

            return await this.sock.sendMessage(chatId, mediaMessage, { ai: this.ai });
        } catch (error) {
            console.error('Error sending media:', error);
            throw error;
        }
    }

    /**
     * Send a document to a chat
     * @param {string} chatId - The ID of the chat to send the document to
     * @param {string} filePath - Path to the document file
     * @param {string} [caption=''] - Optional caption for the document
     * @returns {Promise<object>} The sent message info
     * @throws {Error} If client is not connected or file not found
     */
    async sendDocument(chatId, filePath, caption = '') {
        chatId = this._normalizeJid(chatId);
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            let fileBuffer;
            let fileName;
            let mimeType;
            let isUrl = false;

            try {
                const parsedUrl = new URL(filePath);
                isUrl = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
            } catch (_) { }

            if (isUrl) {
                const response = await fetch(filePath);
                if (!response.ok) {
                    throw new Error(`Failed to fetch document from URL: ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                fileBuffer = Buffer.from(arrayBuffer);

                const contentType = response.headers.get('content-type');
                if (contentType) {
                    mimeType = contentType.split(';')[0].trim();
                } else {
                    mimeType = mime.getType(filePath) || 'application/octet-stream';
                }

                const contentDisposition = response.headers.get('content-disposition');
                if (contentDisposition) {
                    const match = contentDisposition.match(/filename="?([^"]+)"?/);
                    if (match && match[1]) {
                        fileName = match[1];
                    }
                }

                if (!fileName) {
                    const parsedUrl = new URL(filePath);
                    fileName = path.basename(parsedUrl.pathname) || 'document';
                }
            } else {
                if (!fs.existsSync(filePath)) {
                    throw new Error('File not found: ' + filePath);
                }
                fileBuffer = fs.readFileSync(filePath);
                fileName = path.basename(filePath);
                mimeType = mime.getType(filePath) || 'application/octet-stream';
            }

            const messageContent = {
                document: fileBuffer,
                caption: caption,
                mimetype: mimeType,
                fileName: fileName,
            };

            if (typeof caption === 'object' && caption !== null) {
                if (caption.caption) messageContent.caption = caption.caption;

                const { mentions: docMentions, mentionAll: docMentionAll } = this._handleMentions(caption.mentions, caption.mentionAll);
                if (docMentions) messageContent.mentions = docMentions;
                if (docMentionAll !== undefined) messageContent.mentionAll = docMentionAll;
            }

            return await this.sock.sendMessage(chatId, {
                ...messageContent,
            }, { ai: this.ai });
        } catch (error) {
            console.error('Error sending document:', error);
            throw error;
        }
    }

    /**
     * Send a message with interactive buttons
     * @param {string} chatId - The ID of the chat to send the message to
     * @param {object} options - Options for the button message
     * @param {string} [options.text] - The text content of the message
     * @param {string} [options.imagePath] - Optional path to an image to include
     * @param {string} [options.caption] - Caption for the image
     * @param {string} [options.title] - Title for the message
     * @param {string} [options.footer] - Footer text for the message
     * @param {Array} [options.interactiveButtons=[]] - Array of button objects
     * @param {boolean} [options.hasMediaAttachment=false] - Whether the message has a media attachment
     * @param {object} [extraOptions={}] - Additional options for the message
     * @returns {Promise<object>} The sent message info
     * @throws {Error} If client is not connected or message sending fails
     */
    async sendButtons(chatId, options = {}, extraOptions = {}) {
        chatId = this._normalizeJid(chatId);
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        const {
            text,
            imagePath,
            image,
            video,
            document,
            location,
            product,
            mimetype,
            jpegThumbnail,
            caption,
            title,
            subtitle,
            footer,
            interactiveButtons = [],
            hasMediaAttachment = false,
        } = options;

        let messageContent = {};

        try {
            const base = {
                title: title,
                subtitle: subtitle,
                footer: footer,
                interactiveButtons: interactiveButtons,
                hasMediaAttachment: hasMediaAttachment,
            };

            if (imagePath) {
                // Handle message with local image path
                const imageBuffer = fs.readFileSync(imagePath);
                messageContent = {
                    ...base,
                    image: imageBuffer,
                    caption: caption,
                };
            } else if (image || video || document || location || product) {
                // Pass-through media objects (e.g. { image: { url } })
                messageContent = {
                    ...base,
                    ...(image ? { image } : {}),
                    ...(video ? { video } : {}),
                    ...(document ? { document } : {}),
                    ...(location ? { location } : {}),
                    ...(product ? { product } : {}),
                    ...(mimetype ? { mimetype } : {}),
                    ...(jpegThumbnail ? { jpegThumbnail } : {}),
                    caption: caption,
                };
            } else {
                // Handle text-only message
                messageContent = {
                    ...base,
                    text: text,
                };
            }

            // Send the message with buttons
            return await this.sock.sendMessage(chatId, messageContent, { ai: this.ai, ...extraOptions });
        } catch (error) {
            console.error('Error sending buttons:', error);
            throw error;
        }
    }

    /**
     * Send an interactive list message
     * @param {string} chatId - The ID of the chat to send the list to
     * @param {object} listOptions - Options for the list message
     * @param {string} listOptions.text - The text content of the message
     * @param {string} listOptions.title - Title of the list
     * @param {string} [listOptions.footer=''] - Optional footer text
     * @param {string} [listOptions.buttonText='Tap here'] - Text for the button
     * @param {Array<object>} listOptions.sections - Array of section objects
     * @returns {Promise<object>} The sent message info
     * @throws {Error} If client is not connected or message sending fails
     */

    async SendList(chatId, listOptions) {
        chatId = this._normalizeJid(chatId);
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            const listMessage = {
                text: listOptions.text,
                title: listOptions.title,
                footer: listOptions.footer || '',
                buttonText: listOptions.buttonText || 'Tap here',
                sections: listOptions.sections.map((section) => ({
                    title: section.title,
                    rows: section.rows.map((row) => ({
                        title: row.title,
                        rowId: row.id,
                        description: row.description,
                    })),
                })),
            };

            return await this.sock.sendMessage(chatId, listMessage, { ai: this.ai });
        } catch (error) {
            console.error('Error sending list message:', error);
            throw error;
        }
    }

    /**
     * Send Quick Reply Buttons (V2)
     * @param {string} jid - Target JID
     * @param {string} text - Message text
     * @param {Array<object>} buttons - Array of { id, displayText }
     * @param {object} options - { footer }
     */
    async sendQuickReplyV2(jid, text, buttons, options = {}) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        const message = generateQuickReplyButtons(text, buttons, options);
        return await this.sock.sendMessage(jid, message, { ai: this.ai });
    }

    /**
     * Send Generic Interactive Button Message (V2)
     * @param {string} jid - Target JID
     * @param {object} options - Button options
     */
    async sendInteractiveButtonV2(jid, options) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        const message = generateInteractiveButtonMessage(options);
        return await this.sock.sendMessage(jid, message, { ai: this.ai });
    }

    /**
     * Send URL Button (V2)
     * @param {string} jid - Target JID
     * @param {string} text - Message text
     * @param {Array<object>} buttons - Array of { displayText, url }
     * @param {object} options - { title, footer }
     */
    async sendUrlButtonV2(jid, text, buttons, options = {}) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        const message = generateUrlButtonMessage(text, buttons, options);
        return await this.sock.sendMessage(jid, message, { ai: this.ai });
    }

    /**
     * Send Copy Code Button (V2)
     * @param {string} jid - Target JID
     * @param {string} text - Message text
     * @param {string} code - Code to be copied
     * @param {string} buttonText - Text on the copy button
     */
    async sendCopyCodeV2(jid, text, code, buttonText) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        const message = generateCopyCodeButton(text, code, buttonText);
        return await this.sock.sendMessage(jid, message, { ai: this.ai });
    }

    /**
     * Send Combined Buttons (V2)
     * @param {string} jid - Target JID
     * @param {string} text - Message text
     * @param {Array<object>} buttons - Mix of { type: 'reply'|'url'|'call'|'copy', ... }
     * @param {object} options - { title, footer }
     */
    async sendCombinedButtonsV2(jid, text, buttons, options = {}) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        const message = generateCombinedButtons(text, buttons, options);
        return await this.sock.sendMessage(jid, message, { ai: this.ai });
    }

    /**
     * Send Interactive List Message (V2)
     * @param {string} jid - Target JID
     * @param {object} options - List options (title, buttonText, description, footer, sections)
     */
    async sendListV2(jid, options) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        const message = generateInteractiveListMessage(options);
        return await this.sock.relayMessage(jid, message, { ai: this.ai });
    }

    /**
     * Send Buttons Cards Message
     * @param {string} jid - Target JID
     * @param {object} options - Cards options (text, title, subtile, footer, cards)
     */
    async sendcards(jid, options) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        return await this.sock.sendMessage(jid, options, { ai: this.ai });
    }
    /**
     * Send an external ad reply with a local image
     * @param {string} number - The phone number to send the ad to
     * @param {string} localImagePath - Path to the local image file
     * @param {string} title - Title of the ad
     * @param {string} body - Body of the ad
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or message sending fails
     */

    async sendAdReply(number, msg, imgpath, title, body, sourceurl) {
        number = this._normalizeJid(number);
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {

            // Read the local image as Buffer
            const bufferLocalFile = fs.readFileSync(imgpath);

            // Send message with external ad reply using local image
            await this.sock.sendMessage(number, {
                text: msg,
                contextInfo: {
                    externalAdReply: {
                        title: title || 'Ad Title',
                        body: body || 'Ad Description',
                        mediaType: 1, // Image
                        previewType: 0,
                        showAdAttribution: true,
                        renderLargerThumbnail: true,
                        thumbnail: bufferLocalFile,
                        sourceUrl: sourceurl || 'https://m.facebook.com/innovatorssoft',
                        mediaUrl: sourceurl || 'https://m.facebook.com/innovatorssoft'
                    }
                }
            }, { ai: this.ai });

        } catch (err) {
            console.error('Failed to send externalAdReply:', err);
        }
    }

    /**
     * Get all groups the bot is a member of
     * @returns {Promise<Array<Group>>} Array of Group instances
     * @throws {Error} If client is not connected or an error occurs
     */
    async getAllGroups() {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            const groupsData = await this.sock.groupFetchAllParticipating();
            return Object.values(groupsData).map(
                (groupData) => new Group(this, groupData)
            );
        } catch (error) {
            console.error('Error fetching groups:', error);
            throw error;
        }
    }

    /**
     * Add or remove participants from a group
     * @param {string} groupId - The ID of the group
     * @param {Array<string>} participantIds - Array of participant IDs to modify
     * @param {string} action - Action to perform ('add', 'remove', 'promote', 'demote')
     * @returns {Promise<Array>} Array of results for each participant update
     * @throws {Error} If client is not connected or an error occurs
     */
    async changeGroupParticipants(groupId, participantIds, action) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        const results = [];

        try {
            for (let participantId of participantIds) {
                participantId = this._normalizeJid(participantId);
                try {
                    let updateResult = await this.sock.groupParticipantsUpdate(
                        groupId,
                        [participantId],
                        action
                    );

                    // Baileys may return various formats:
                    // 1. Array: [{ status: 200, jid: '...' }]
                    // 2. Array with nested: [{ '123@s.whatsapp.net': { code: 200 } }]
                    // 3. Direct object: { status: 200, jid: '...' }
                    let participantResult = Array.isArray(updateResult) ? updateResult[0] : updateResult;

                    // Handle the { [jid]: { code: ... } } format
                    if (participantResult && typeof participantResult === 'object') {
                        // Check if the result has the participant JID as a key
                        const jidKey = Object.keys(participantResult).find(k => k.includes('@'));
                        if (jidKey && participantResult[jidKey]) {
                            const innerResult = participantResult[jidKey];
                            participantResult = {
                                status: innerResult.code || innerResult.status || 200,
                                jid: jidKey,
                                message: innerResult.message || (innerResult.code == 200 ? 'Success' : undefined),
                                ...innerResult
                            };
                        }
                    }

                    // Normalize status to number
                    let status = participantResult?.status || participantResult?.code;

                    // If no status but no error, assume success
                    if (status === undefined && !participantResult?.error) {
                        status = 200;
                    }

                    if (action === 'add' && (status === 403 || status === '403')) {
                        try {
                            await this.sendGroupInvitation(groupId, participantId, null);
                            participantResult.invitationSent = true;
                            participantResult.message = 'Invitation link sent due to privacy settings';
                            participantResult.status = 403;
                        } catch (invError) {
                            participantResult.invitationSent = false;
                            participantResult.error = 'Privacy restricted, and failed to send invitation link';
                            participantResult.status = 403;
                        }
                    } else if (participantResult) {
                        participantResult.status = status ? parseInt(status) : 200;
                        if (participantResult.status === 200) {
                            participantResult.message = participantResult.message || 'Successfully added to group';
                        }
                    }

                    results.push(participantResult || { status: 200, jid: participantId, message: 'Added successfully' });
                } catch (participantError) {

                    const statusCode = participantError.output?.statusCode || participantError.data?.status;

                    if (action === 'add' && (statusCode === 403 || statusCode === '403')) {
                        try {
                            await this.sendGroupInvitation(groupId, participantId, null);
                            results.push({
                                status: 403,
                                jid: participantId,
                                invitationSent: true,
                                message: 'Invitation link sent due to privacy settings'
                            });
                            continue;
                        } catch (invError) {
                            console.error('Failed to send fallback invitation:', invError);
                        }
                    }

                    results.push({
                        status: statusCode || 500,
                        jid: participantId,
                        error: participantError.message || 'Unknown error'
                    });
                }
            }
            return results;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get group name from metadata
     * @param {string} groupId - The group JID
     * @returns {Promise<string>} The group name
     * @private
     */
    async _getGroupName(groupId) {
        try {
            const metadata = await this.getGroupMetadata(groupId);
            return metadata.subject || 'Group';
        } catch (error) {
            console.error('Error getting group name:', error);
            return 'Group';
        }
    }

    /**
     * Send a group invitation link to a user
     * @param {string} groupId - The group JID
     * @param {string} participantId - The participant JID to send invitation to
     * @param {string} [customMessage] - Optional custom invitation message
     * @returns {Promise<object>} The sent message info
     * @throws {Error} If client is not connected or an error occurs
     */

    async sendGroupInvitation(groupId, participantId, customMessage) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            // Get group invite code
            const inviteCode = await this.sock.groupInviteCode(groupId);
            const groupName = await this._getGroupName(groupId);

            // Create the invitation link
            const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;

            // Create the invitation message
            const message = customMessage
                ? `${customMessage}\n\n${inviteLink}`
                : `📨 *Group Invitation*\n\n` +
                `You have been invited to join:\n` +
                `*${groupName}*\n\n` +
                `Click the link below to join:\n${inviteLink}`;

            // Send as text message
            return await this.sock.sendMessage(participantId, {
                text: message
            }, { ai: this.ai });
        } catch (error) {
            console.error('Error sending group invitation:', error);
            throw error;
        }
    }

    /**
     * Mark a message as read
     * @param {object|string} messageKey - The message key object or message ID
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or an error occurs
     */
    async readMessage(messageKey) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            // If messageKey is a string (legacy), convert to key object format
            // Otherwise use it directly as a key object
            if (typeof messageKey === 'string') {
                // Legacy support: just ID string
                await this.sock.readMessages([{ id: messageKey }]);
            } else {
                // Proper key object with remoteJid, id, fromMe, etc.
                await this.sock.readMessages([messageKey]);
            }
        } catch (error) {
            console.error('Error marking message as read:', error);
            throw error;
        }
    }

    /**
     * Check if a phone number is registered on WhatsApp
     * @param {string} phoneNumber - The phone number to check (with country code, without '+')
     * @returns {Promise<boolean>} True if the number is on WhatsApp, false otherwise
     * @throws {Error} If an error occurs during the check
     */
    async isNumberOnWhatsApp(phoneNumber) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            const result = await this.sock.onWhatsApp(phoneNumber);
            return result.length > 0 && result[0].exists === true;
        } catch (error) {
            console.error('Error checking if number is on WhatsApp:', error);
            throw error;
        }
    }

    /**
     * Get the profile picture URL for a contact or group
     * @param {string} id - The contact or group JID
     * @returns {Promise<string|undefined>} The profile picture URL, or undefined if not available
     */
    async getProfilePicture(id) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            return await this.sock.profilePictureUrl(id);
        } catch (error) {
            // If the error is because the user has no profile picture, return undefined
            const isStatus = (err, code) => (
                (err && typeof err.message === 'string' && err.message.includes(String(code))) ||
                (err && (err.status === code || err.code === code || err.data === code)) ||
                (err && err.response && err.response.status === code) ||
                (err && err.output && err.output.statusCode === code)
            );
            if (isStatus(error, 404) || isStatus(error, 401)) {
                return undefined;
            }
            console.error('Error getting profile picture:', error);
            throw error;
        }
    }
    /**
     * Reject an incoming call
     * @param {string} callId - The ID of the call to reject
     * @param {object} callInfo - Additional call information
     * @returns {Promise<void>}
     */
    async rejectCall(callId, callInfo) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            await this.sock.rejectCall(callId, callInfo);
        } catch (error) {
            console.error('Error rejecting call:', error);
            throw error;
        }
    }

    async initiateCall(jid, options = {}) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            return await this.sock.initiateCall(jid, options);
        } catch (error) {
            console.error('Error initiating call:', error);
            throw error;
        }
    }

    async cancelCall(callId, jid) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            return await this.sock.cancelCall(callId, jid);
        } catch (error) {
            console.error('Error canceling call:', error);
            throw error;
        }
    }

    /**
     * Get the underlying socket instance
     * @returns {object} The socket instance
     */
    getSock() {
        return this.sock;
    }

    /**
     * Send typing indicator to a chat
     * @param {string} jid - The JID of the chat
     * @returns {Promise<void>}
     */
    async sendStateTyping(jid) {
        if (!this.sock) throw new Error('Not connected to WhatsApp');
        await this.sock.sendPresenceUpdate("composing", jid);
    }

    /**
     * Send recording indicator to a chat
     * @param {string} jid - The JID of the chat
     * @returns {Promise<void>}
     */
    async sendStateRecording(jid) {
        if (!this.sock) throw new Error('Not connected to WhatsApp');
        await this.sock.sendPresenceUpdate("recording", jid);
    }

    /**
     * Clear typing/recording indicator from a chat
     * @param {string} jid - The JID of the chat
     * @returns {Promise<void>}
     */
    async clearState(jid) {
        if (!this.sock) throw new Error('Not connected to WhatsApp');
        await this.sock.sendPresenceUpdate("paused", jid);
    }

    /**
     * Create a typing indicator controller for manual or standalone presence control
     * @returns {object} The typing indicator controller
     */
    createPresenceController() {
        if (!this.sock) throw new Error('Client is not connected');
        return createTypingIndicator(
            (jid, presence) => this.sock.sendPresenceUpdate(presence, jid)
        );
    }

    /**
     * Reinitialize the WhatsApp client by clearing the session and reconnecting
     * @returns {Promise<void>}
     */
    async reinitialize() {
        try {
            //console.log('Starting session reinitialization...');

            // Reset connection state
            this.isConnected = false;

            // Clear the session data if it exists
            if (fs.existsSync(this.sessionName)) {
                await fs.promises.rm(this.sessionName, {
                    recursive: true,
                    force: true,
                });
                //console.log('Cleared existing session data');
            }

            // Clear any existing socket
            if (this.sock) {
                try {
                    this.sock.ev.removeAllListeners();
                    this.sock.end(undefined);
                } catch (e) {
                    console.error('Error while cleaning up socket:', e);
                }
                this.sock = null;
            }

            // Clear store interval
            if (this._storeInterval) {
                clearInterval(this._storeInterval);
                this._storeInterval = null;
            }

            // Add a small delay before reconnecting
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Reconnect with a fresh session
            //console.log('Establishing new connection...');
            await this.connect(1); // Start with attempt 1
            this.emit('reinitialized');
        } catch (error) {
            console.error('Error during reinitialization:', error);
            this.emit('error', error);
            throw error;
        }
    }
    /**
     * Get LID (Local Identifier) for a phone number
     * @param {string} phoneNumber - Phone number in format: '1234567890@s.whatsapp.net'
     * @returns {Promise<string|undefined>} The LID for the phone number, or undefined if not found
     */
    async getLIDForPN(phoneNumber) {
        if (!this.sock || !this.store) {
            throw new Error('Client is not connected');
        }
        try {
            return await this.store.getLIDForPN(phoneNumber);
        } catch (error) {
            console.error('Error getting LID for PN:', error);
            return undefined;
        }
    }

    /**
     * Get Phone Number for a LID (Local Identifier)
     * @param {string} lid - LID in format: '123456@lid'
     * @returns {Promise<string|undefined>} The phone number for the LID, or undefined if not found
     */
    async getPNForLID(lid) {
        if (!this.sock || !this.store) {
            throw new Error('Client is not connected');
        }
        try {
            return await this.store.getPNForLID(lid);
        } catch (error) {
            console.error('Error getting PN for LID:', error);
            return undefined;
        }
    }

    /**
     * Get multiple LIDs for multiple phone numbers
     * @param {Array<string>} phoneNumbers - Array of phone numbers
     * @returns {Promise<Array<string>>} Array of LIDs
     */
    async getLIDsForPNs(phoneNumbers) {
        if (!this.sock || !this.store) {
            throw new Error('Client is not connected');
        }
        try {
            return await this.store.getLIDsForPNs(phoneNumbers);
        } catch (error) {
            console.error('Error getting LIDs for PNs:', error);
            return [];
        }
    }

    /**
     * Get group metadata with caching
     * @param {string} jid - The group JID
     * @returns {Promise<object>} The group metadata
     */
    async getGroupMetadata(jid) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        // Check cache first
        const cached = this.groupMetadataCache.get(jid);
        if (cached) {
            return cached;
        }

        // Fetch from WhatsApp if not cached
        try {
            const metadata = await this.sock.groupMetadata(jid);
            // Cache the result
            this.groupMetadataCache.set(jid, metadata);
            return metadata;
        } catch (error) {
            console.error(`Error fetching metadata for group ${jid}:`, error);
            throw error;
        }
    }

    /**
     * Update group metadata in cache
     * @param {string} jid - The group JID
     * @param {object} metadata - The group metadata
     */
    updateGroupMetadataCache(jid, metadata) {
        if (this.groupMetadataCache) {
            this.groupMetadataCache.set(jid, metadata);
        }
    }

    /**
     * Clear group metadata from cache
     * @param {string} jid - The group JID
     */
    clearGroupMetadataCache(jid) {
        if (this.groupMetadataCache) {
            this.groupMetadataCache.del(jid);
        }
    }

    /**
     * Clear all group metadata from cache
     */
    clearAllGroupMetadataCache() {
        if (this.groupMetadataCache) {
            this.groupMetadataCache.flushAll();
        }
    }

    /**
     * Log out from WhatsApp
     * @returns {Promise<boolean>} True if logout was successful
     * @throws {Error} If logout fails
     */
    async logout() {
        if (!this.sock) {
            this.emit('logout', 'Already logged out');
            return true;
        }

        try {
            // Properly close the socket connection
            await this.sock.logout();
            await this.sock.end();
            this.sock = null;

            // Remove session data if it exists
            if (fs.existsSync(this.sessionName)) {
                fs.rmSync(this.sessionName, {
                    recursive: true,
                    force: true,
                });
            }

            // Update connection state and emit event
            this.isConnected = false;

            this.emit('logout', 'Logged out successfully');

            return true;
        } catch (error) {
            console.error('Logout error:', error);
            this.emit('error', new Error(`Failed to logout: ${error.message}`));
            throw error;
        }
    }

    /**
      * Download media from a message
      * @param {object} message - The message object containing media (must have raw property)
      * @returns {Promise<object|null>} Object with buffer, mimetype, and extension, or null if no media
      * @throws {Error} If client is not connected or download fails
      */
    async downloadMedia(message) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        // Check if message has media
        const hasMedia = Boolean(
            message.raw?.message?.imageMessage ||
            message.raw?.message?.videoMessage ||
            message.raw?.message?.audioMessage ||
            message.raw?.message?.documentMessage
        );

        if (!hasMedia) {
            return null;
        }

        try {
            // Use Baileys' downloadMediaMessage function with the raw message
            const buffer = await downloadMediaMessage(message.raw, 'buffer', {});

            if (buffer) {
                // Get the message content to determine file type
                const messageContent = message.raw.message;
                let mimetype = 'application/octet-stream';

                // Determine mimetype from the message type
                if (messageContent.imageMessage) {
                    mimetype = messageContent.imageMessage.mimetype || 'image/jpeg';
                } else if (messageContent.videoMessage) {
                    mimetype = messageContent.videoMessage.mimetype || 'video/mp4';
                } else if (messageContent.audioMessage) {
                    mimetype = messageContent.audioMessage.mimetype || 'audio/ogg';
                } else if (messageContent.documentMessage) {
                    mimetype = messageContent.documentMessage.mimetype || 'application/octet-stream';
                }

                // Use mime.getExtension() to get the proper file extension
                const extension = mime.getExtension(mimetype) || 'bin';

                return {
                    buffer,
                    mimetype,
                    extension,
                    size: buffer.length
                };
            }

            return null;
        } catch (error) {
            console.error('Error downloading media:', error);
            throw error;
        }
    }

    /**
     * Parse JID information
     * @param {string} jid - The JID to parse
     * @returns {object} JID info (isLid, user, etc.)
     */
    parseJid(jid) {
        return parseJid(jid);
    }

    /**
     * Normalize phone number to WhatsApp JID
     * @param {string} phone - Phone number
     * @returns {string} Normalized JID
     */
    normalizePhoneToJid(phone) {
        return normalizePhoneToJid(phone);
    }

    /**
     * Plot JID (Convert between PN and LID if mapping is available)
     * @param {string} jid - JID to plot
     * @returns {string|undefined} Plotted JID
     */
    plotJid(jid) {
        return plotJid(jid);
    }

    /**
     * Send a sticker with metadata
     * @param {string} chatId - Target chat JID
     * @param {Buffer} webpBuffer - WebP sticker buffer
     * @param {object} metadata - Sticker metadata (packName, author, etc.)
     * @returns {Promise<object>} Sent message info
     */

    // send sticker
    async sendSticker(chatId, buffer, metadata = {}) {
        if (!this.isConnected) throw new Error('Client is not connected');

        try {
            const sticker = new Sticker(buffer, {
                pack: metadata.packName || 'Innovators',
                author: metadata.author || 'Innovators',
                type: metadata.type || StickerTypes.FULL,
                categories: metadata.categories || [],
                id: metadata.id || 'innovators-bot',
                quality: metadata.quality || 50
            });

            const stickerBuffer = await sticker.toBuffer();

            return await this.sock.sendMessage(chatId, {
                sticker: stickerBuffer
            }, { ai: this.ai });
        } catch (error) {
            console.error('Error generating sticker:', error);
            throw error;
        }
    }

    /**
     * Get all stored messages for a specific chat
     * @param {string} chatId - The JID of the chat
     * @returns {Array} Array of stored messages (WebMessageInfo)
     */
    getStoredMessages(chatId) {
        return this.messageStore.getChatMessages(chatId);
    }

    /**
     * Get a specific stored message by its key
     * @param {object} key - The message key { remoteJid, id, fromMe }
     * @returns {object|undefined} The stored message (WebMessageInfo)
     */
    getStoredMessage(key) {
        return this.messageStore.getOriginalMessage(key);
    }

    /**
     * Get statistics about the message store
     * @returns {object} Store statistics
     */
    getStoreStats() {
        return this.messageStore.getStats();
    }

    /**
     * Get all stored messages from all chats
     * @returns {Array} Array of all stored messages
     */
    getAllStoredMessages() {
        return this.messageStore.getChatIds().flatMap(chatId => this.messageStore.getChatMessages(chatId));
    }

    /**
     * Get IDs of all chats that have stored messages
     * @returns {Array<string>} Array of chat JIDs
     */
    getStoredChatIds() {
        return this.messageStore.getChatIds();
    }

    /**
     * Clear the entire message store
     */
    clearMessageStore() {
        this.messageStore.clear();
        this.emit('store-cleared');
    }

    /**
     * Clear stored messages for a specific chat
     * @param {string} chatId - The JID of the chat to clear
     */
    clearChatStore(chatId) {
        this.messageStore.clearChat(chatId);
        this.emit('chat-store-cleared', chatId);
    }

    /**
     * Save the message store to a JSON file
     * @returns {Promise<{success: boolean, path: string, messageCount: number}>}
     */
    async saveMessageStore() {
        try {
            const rawAllMessages = this.messageStore.getAllMessages();
            const stats = this.messageStore.getStats();

            let allMessages = [];
            if (Array.isArray(rawAllMessages)) {
                allMessages = rawAllMessages;
            } else if (rawAllMessages && typeof rawAllMessages[Symbol.iterator] === 'function') {
                allMessages = Array.from(rawAllMessages);
            } else if (rawAllMessages && typeof rawAllMessages === 'object') {
                allMessages = Object.values(rawAllMessages);
            } else {
                try {
                    allMessages = this.messageStore.getChatIds().flatMap(chatId => this.messageStore.getChatMessages(chatId));
                } catch {
                    allMessages = [];
                }
            }

            // Serialize the store data
            const storeData = {
                version: '1.0.0',
                savedAt: new Date().toISOString(),
                sessionName: this.sessionName,
                stats: stats,
                messages: []
            };

            // Convert Map structure to serializable array format
            for (const msg of allMessages) {
                try {
                    storeData.messages.push({
                        key: msg.key,
                        message: msg.message,
                        messageTimestamp: msg.messageTimestamp,
                        pushName: msg.pushName,
                        broadcast: msg.broadcast,
                        isDeleted: msg.isDeleted
                    });
                } catch (err) {
                    console.error('Error serializing message:', err);
                }
            }

            // Ensure directory exists
            const dir = path.dirname(this.messageStoreFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Write to file
            fs.writeFileSync(
                this.messageStoreFilePath,
                JSON.stringify(storeData, null, 2),
                'utf8'
            );

            this._lastStoreSave = new Date();
            this._storeChangeCount = 0;

            // console.log(`[MessageStore] Saved ${storeData.messages.length} messages to ${this.messageStoreFilePath}`);

            return {
                success: true,
                path: this.messageStoreFilePath,
                messageCount: storeData.messages.length,
                savedAt: this._lastStoreSave
            };
        } catch (error) {
            console.error('[MessageStore] Error saving store:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Load the message store from a JSON file
     * @returns {Promise<{success: boolean, messageCount: number}>}
     */
    async loadMessageStore() {
        try {
            if (!fs.existsSync(this.messageStoreFilePath)) {
                // console.log('[MessageStore] No saved store file found');
                return { success: false, reason: 'file_not_found' };
            }

            const fileContent = fs.readFileSync(this.messageStoreFilePath, 'utf8');
            const storeData = JSON.parse(fileContent);

            // Validate data structure
            if (!storeData.messages || !Array.isArray(storeData.messages)) {
                throw new Error('Invalid store file format');
            }

            // Clear existing store
            this.messageStore.clear();

            // Load messages into the store
            let loadedCount = 0;
            for (const msgData of storeData.messages) {
                try {
                    // Use the message store's internal handler to properly store messages
                    const storeHandler = createMessageStoreHandler(this.messageStore);
                    storeHandler({
                        messages: [{
                            key: msgData.key,
                            message: msgData.message,
                            messageTimestamp: msgData.messageTimestamp,
                            pushName: msgData.pushName,
                            broadcast: msgData.broadcast
                        }],
                        type: 'append'
                    });
                    loadedCount++;
                } catch (err) {
                    console.error('[MessageStore] Error loading message:', err);
                }
            }

            this._lastStoreSave = new Date(storeData.savedAt);
            this._storeChangeCount = 0;

            // console.log(`[MessageStore] Loaded ${loadedCount}/${storeData.messages.length} messages from ${this.messageStoreFilePath}`);

            this.emit('store-loaded', { messageCount: loadedCount });

            return {
                success: true,
                messageCount: loadedCount,
                loadedFrom: storeData.savedAt
            };
        } catch (error) {
            console.error('[MessageStore] Error loading store:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Start auto-save timer
     * @private
     */
    _startAutoSave() {
        if (this._autoSaveTimer) {
            clearInterval(this._autoSaveTimer);
        }

        if (this.autoSaveInterval > 0) {
            this._autoSaveTimer = setInterval(async () => {
                // Only save if there have been changes
                if (this._storeChangeCount > 0) {
                    // console.log(`[MessageStore] Auto-saving (${this._storeChangeCount} changes since last save)`);
                    await this.saveMessageStore();
                }
            }, this.autoSaveInterval);

            // console.log(`[MessageStore] Auto-save enabled (interval: ${this.autoSaveInterval}ms)`);
        }
    }

    /**
     * Stop auto-save timer
     * @private
     */
    _stopAutoSave() {
        if (this._autoSaveTimer) {
            clearInterval(this._autoSaveTimer);
            this._autoSaveTimer = null;
            // console.log('[MessageStore] Auto-save disabled');
        }
    }

    /**
     * Increment the store change counter (called when messages are added)
     * @private
     */
    _incrementStoreChangeCount() {
        this._storeChangeCount++;
    }

    // ═══════════════════════════════════════════════════════════
    // 📁 GROUP MANAGEMENT METHODS
    // ═══════════════════════════════════════════════════════════

    /**
     * Create a new WhatsApp group
     * @param {string} name - The name/subject of the group
     * @param {Array<string>} participants - Array of participant JIDs (e.g., ['1234@s.whatsapp.net'])
     * @returns {Promise<object>} The created group info (includes gid/id)
     * @throws {Error} If client is not connected or group creation fails
     */
    async createGroup(name, participants = []) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            const group = await this.sock.groupCreate(name, participants);
            return group;
        } catch (error) {
            console.error('Error creating group:', error);
            throw error;
        }
    }

    /**
     * Change the subject (name) of a group
     * @param {string} groupId - The group JID
     * @param {string} newSubject - The new subject/name for the group
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or update fails
     */
    async changeGroupSubject(groupId, newSubject) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            await this.sock.groupUpdateSubject(groupId, newSubject);
            // Update the cache with the new subject
            const cached = this.groupMetadataCache.get(groupId);
            if (cached) {
                cached.subject = newSubject;
                this.updateGroupMetadataCache(groupId, cached);
            }
        } catch (error) {
            console.error('Error changing group subject:', error);
            throw error;
        }
    }

    /**
     * Change the description of a group
     * @param {string} groupId - The group JID
     * @param {string} newDescription - The new description for the group
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or update fails
     */
    async changeGroupDescription(groupId, newDescription) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            await this.sock.groupUpdateDescription(groupId, newDescription);
            // Update the cache with the new description
            const cached = this.groupMetadataCache.get(groupId);
            if (cached) {
                cached.desc = newDescription;
                this.updateGroupMetadataCache(groupId, cached);
            }
        } catch (error) {
            console.error('Error changing group description:', error);
            throw error;
        }
    }

    /**
     * Change group settings (announcement mode, locked/unlocked)
     * @param {string} groupId - The group JID
     * @param {string} setting - The setting to apply: 'announcement' (only admins send), 'not_announcement' (everyone sends), 'locked' (only admins edit info), 'unlocked' (everyone edits info)
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or update fails
     */
    async changeGroupSettings(groupId, setting) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        const validSettings = ['announcement', 'not_announcement', 'locked', 'unlocked'];
        if (!validSettings.includes(setting)) {
            throw new Error(`Invalid setting: ${setting}. Must be one of: ${validSettings.join(', ')}`);
        }

        try {
            await this.sock.groupSettingUpdate(groupId, setting);
        } catch (error) {
            console.error('Error changing group settings:', error);
            throw error;
        }
    }

    /**
     * Get the invite code for a group
     * @param {string} groupId - The group JID
     * @returns {Promise<string>} The invite code (use with https://chat.whatsapp.com/{code})
     * @throws {Error} If client is not connected or fetch fails
     */
    async getGroupInviteCode(groupId) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            const code = await this.sock.groupInviteCode(groupId);
            return code;
        } catch (error) {
            console.error('Error getting group invite code:', error);
            throw error;
        }
    }

    /**
     * Revoke the current invite code for a group (generates a new one)
     * @param {string} groupId - The group JID
     * @returns {Promise<string>} The new invite code
     * @throws {Error} If client is not connected or revoke fails
     */
    async revokeGroupInviteCode(groupId) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            const newCode = await this.sock.groupRevokeInvite(groupId);
            return newCode;
        } catch (error) {
            console.error('Error revoking group invite code:', error);
            throw error;
        }
    }

    /**
     * Leave a group
     * @param {string} groupId - The group JID
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or leave fails
     */
    async leaveGroup(groupId) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            await this.sock.groupLeave(groupId);
            // Clean up the cache for this group
            this.clearGroupMetadataCache(groupId);
        } catch (error) {
            console.error('Error leaving group:', error);
            throw error;
        }
    }

    /**
     * Join a group using an invitation code
     * @param {string} inviteCode - The invite code (without https://chat.whatsapp.com/)
     * @returns {Promise<string>} The group JID that was joined
     * @throws {Error} If client is not connected or join fails
     */
    async joinGroupByInviteCode(inviteCode) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            // Strip URL prefix if accidentally included
            const code = inviteCode.replace('https://chat.whatsapp.com/', '');
            const response = await this.sock.groupAcceptInvite(code);
            return response;
        } catch (error) {
            console.error('Error joining group by invite code:', error);
            throw error;
        }
    }

    /**
     * Get group info by invite code (without joining)
     * @param {string} inviteCode - The invite code (without https://chat.whatsapp.com/)
     * @returns {Promise<object>} The group information
     * @throws {Error} If client is not connected or fetch fails
     */

    async getGroupInfoByInviteCode(inviteCode) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            // Strip URL prefix if accidentally included
            const code = inviteCode.replace('https://chat.whatsapp.com/', '');
            const response = await this.sock.groupGetInviteInfo(code);
            return response;
        } catch (error) {
            console.error('Error getting group info by invite code:', error);
            throw error;
        }
    }

    /**
     * Get the list of pending join requests for a group
     * @param {string} groupId - The group JID
     * @returns {Promise<Array>} Array of pending join requests
     * @throws {Error} If client is not connected or fetch fails
     */

    async getGroupJoinRequests(groupId) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            const response = await this.sock.groupRequestParticipantsList(groupId);
            return response;
        } catch (error) {
            console.error('Error getting group join requests:', error);
            throw error;
        }
    }

    /**
     * Approve or reject group join requests
     * @param {string} groupId - The group JID
     * @param {Array<string>} participantIds - Array of participant JIDs to approve/reject
     * @param {string} action - 'approve' or 'reject'
     * @returns {Promise<object>} The response from the action
     * @throws {Error} If client is not connected or action fails
     */
    async handleGroupJoinRequest(groupId, participantIds, action) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        const validActions = ['approve', 'reject'];
        if (!validActions.includes(action)) {
            throw new Error(`Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`);
        }

        try {
            const response = await this.sock.groupRequestParticipantsUpdate(groupId, participantIds, action);
            return response;
        } catch (error) {
            console.error(`Error ${action}ing group join request:`, error);
            throw error;
        }
    }

    /**
     * Toggle ephemeral (disappearing) messages in a group
     * @param {string} groupId - The group JID
     * @param {number} ephemeralExpiration - Duration in seconds (0 = off, 86400 = 24h, 604800 = 7d, 7776000 = 90d)
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or toggle fails
     */
    async toggleGroupEphemeral(groupId, ephemeralExpiration) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            await this.sock.groupToggleEphemeral(groupId, ephemeralExpiration);
        } catch (error) {
            console.error('Error toggling group ephemeral:', error);
            throw error;
        }
    }

    /**
     * Change who can add members to a group
     * @param {string} groupId - The group JID
     * @param {string} mode - 'all_member_add' (all members can add) or 'admin_add' (only admins can add)
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or update fails
     */
    async changeGroupAddMode(groupId, mode) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        const validModes = ['all_member_add', 'admin_add'];
        if (!validModes.includes(mode)) {
            throw new Error(`Invalid mode: ${mode}. Must be one of: ${validModes.join(', ')}`);
        }

        try {
            await this.sock.groupMemberAddMode(groupId, mode);
        } catch (error) {
            console.error('Error changing group add mode:', error);
            throw error;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 🔒 PRIVACY METHODS
    // ═══════════════════════════════════════════════════════════

    /**
     * Block a user
     * @param {string} jid - The JID of the user to block
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or block fails
     */
    async blockUser(jid) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            await this.sock.updateBlockStatus(jid, 'block');
        } catch (error) {
            console.error('Error blocking user:', error);
            throw error;
        }
    }

    /**
     * Unblock a user
     * @param {string} jid - The JID of the user to unblock
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or unblock fails
     */
    async unblockUser(jid) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            await this.sock.updateBlockStatus(jid, 'unblock');
        } catch (error) {
            console.error('Error unblocking user:', error);
            throw error;
        }
    }

    /**
     * Get current privacy settings
     * @param {boolean} [forceGet=true] - Whether to force-fetch the latest settings
     * @returns {Promise<object>} The privacy settings object
     * @throws {Error} If client is not connected or fetch fails
     */
    async getPrivacySettings(forceGet = true) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            const settings = await this.sock.fetchPrivacySettings(forceGet);
            return settings;
        } catch (error) {
            console.error('Error fetching privacy settings:', error);
            throw error;
        }
    }

    /**
     * Get the list of blocked contacts
     * @returns {Promise<Array<string>>} Array of blocked JIDs
     * @throws {Error} If client is not connected or fetch fails
     */
    async getBlockList() {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            const blocklist = await this.sock.fetchBlocklist();
            return blocklist;
        } catch (error) {
            console.error('Error fetching block list:', error);
            throw error;
        }
    }

    /**
     * Update last seen privacy setting
     * @param {string} value - 'all' | 'contacts' | 'contact_blacklist' | 'none'
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or update fails
     */
    async updateLastSeenPrivacy(value) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            await this.sock.updateLastSeenPrivacy(value);
        } catch (error) {
            console.error('Error updating last seen privacy:', error);
            throw error;
        }
    }

    /**
     * Update online status privacy setting
     * @param {string} value - 'all' | 'match_last_seen'
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or update fails
     */
    async updateOnlinePrivacy(value) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            await this.sock.updateOnlinePrivacy(value);
        } catch (error) {
            console.error('Error updating online privacy:', error);
            throw error;
        }
    }

    /**
     * Decrypt and aggregate poll votes
     * @param {object} key - The message key of the poll creation message
     * @param {Array} pollUpdates - The poll updates array from messages.update event
     * @returns {Promise<Array>} The aggregated poll votes
     * @throws {Error} If poll creation message is not found
     */
    async decryptPollVotes(key, pollUpdates) {
        if (!this.isConnected) throw new Error('Client is not connected');

        const pollCreation = this.messageStore.getOriginalMessage(key);
        if (!pollCreation) {
            throw new Error('Poll creation message not found in store');
        }

        return await getAggregateVotesInPollMessage({
            message: pollCreation.message || pollCreation,
            pollUpdates: pollUpdates,
        });
    }

    /**
     * Update profile picture privacy setting
     * @param {string} value - 'all' | 'contacts' | 'contact_blacklist' | 'none'
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or update fails
     */

    async updateProfilePicturePrivacy(value) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            await this.sock.updateProfilePicturePrivacy(value);
        } catch (error) {
            console.error('Error updating profile picture privacy:', error);
            throw error;
        }
    }

    /**
     * Update status privacy setting
     * @param {string} value - 'all' | 'contacts' | 'contact_blacklist' | 'none'
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or update fails
     */
    async updateStatusPrivacy(value) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            await this.sock.updateStatusPrivacy(value);
        } catch (error) {
            console.error('Error updating status privacy:', error);
            throw error;
        }
    }

    /**
     * Update read receipts privacy setting
     * @param {string} value - 'all' | 'none'
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or update fails
     */

    async updateReadReceiptsPrivacy(value) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            await this.sock.updateReadReceiptsPrivacy(value);
        } catch (error) {
            console.error('Error updating read receipts privacy:', error);
            throw error;
        }
    }

    /**
     * Update groups add privacy setting (who can add you to groups)
     * @param {string} value - 'all' | 'contacts' | 'contact_blacklist'
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or update fails
     */

    async updateGroupsAddPrivacy(value) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        try {
            await this.sock.updateGroupsAddPrivacy(value);
        } catch (error) {
            console.error('Error updating groups add privacy:', error);
            throw error;
        }
    }

    /**
     * Update default disappearing mode for new chats
     * @param {number} duration - Duration in seconds (0 = off, 86400 = 24h, 604800 = 7d, 7776000 = 90d)
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or update fails
     */

    async updateDefaultDisappearingMode(duration) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        try {
            await this.sock.updateDefaultDisappearingMode(duration);
        } catch (error) {
            console.error('Error updating default disappearing mode:', error);
            throw error;
        }
    }

    /**
     * Update profile status (about)
     * @param {string} status - The new status message
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or update fails
     */
    async updateProfileStatus(status) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        try {
            await this.sock.updateProfileStatus(status);
        } catch (error) {
            console.error('Error updating profile status:', error);
            throw error;
        }
    }

    /**
     * Update profile name
     * @param {string} name - The new profile name
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or update fails
     */
    async updateProfileName(name) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        try {
            await this.sock.updateProfileName(name);
        } catch (error) {
            console.error('Error updating profile name:', error);
            throw error;
        }
    }

    /**
     * Add EXIF metadata to an existing WebP buffer
     * @param {Buffer} buffer - WebP buffer
     * @param {object} metadata - Metadata (packName, author)
     * @returns {Buffer} Buffer with EXIF
     */
    async addExifToSticker(buffer, metadata = {}) {
        try {
            const sticker = new Sticker(buffer, {
                pack: metadata.packName || 'Innovators',
                author: metadata.author || 'Innovators'
            });
            return await sticker.toBuffer();
        } catch (error) {
            console.error('Error adding EXIF to sticker:', error);
            throw error;
        }
    }

    /**
     * Post a status update (story) with various media types and styles
     * @param {object} options Options for the status update
     * @param {string} [options.text] Text content for a text status
     * @param {string|number[]} [options.backgroundColor] Background color for text status (hex or array of rgb)
     * @param {number} [options.font] Font type for text status (1-5)
     * @param {string} [options.textColor] Text color (hex)
     * @param {string} [options.imagePath] Path to image file for image status
     * @param {string} [options.videoPath] Path to video file for video status
     * @param {string} [options.audioPath] Path to audio file for voice note status
     * @param {Buffer} [options.imageBuffer] Buffer containing image data
     * @param {Buffer} [options.videoBuffer] Buffer containing video data
     * @param {Buffer} [options.audioBuffer] Buffer containing audio data
     * @param {string} [options.caption] Caption for image or video status
     * @param {boolean} [options.isGif=false] Whether the video should be played as a GIF
     * @param {Array<string>} [contacts=[]] List of JIDs who should receive the status (important for Multi-Device)
     * @returns {Promise<object>} The sent message info
     * @throws {Error} If client is not connected or options are invalid
     */
    async sendStatus(options = {}, contacts = []) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            let statusMessage;

            // Voice Note Status
            if (options.audioPath || options.audioBuffer) {
                const buffer = options.audioBuffer || fs.readFileSync(options.audioPath);
                statusMessage = StatusHelper.voiceNote(buffer);
            }
            // Image Status
            else if (options.imagePath || options.imageBuffer) {
                const buffer = options.imageBuffer || fs.readFileSync(options.imagePath);
                statusMessage = StatusHelper.image(buffer, options.caption || '');
            }
            // Video / GIF Status
            else if (options.videoPath || options.videoBuffer) {
                const buffer = options.videoBuffer || fs.readFileSync(options.videoPath);
                if (options.isGif) {
                    statusMessage = StatusHelper.gif(buffer, options.caption || '');
                } else {
                    statusMessage = StatusHelper.video(buffer, options.caption || '');
                }
            }
            // Text Status
            else if (options.text) {
                statusMessage = StatusHelper.text(
                    options.text,
                    options.backgroundColor || STATUS_BACKGROUNDS.solid.purple,
                    options.font || STATUS_FONTS.SANS_SERIF,
                    options.textColor
                );
            } else {
                throw new Error('Invalid status options: Provide text, image, video, or audio.');
            }

            // Send using the new StatusHelper
            return await StatusHelper.send(this.sock, statusMessage, contacts);

        } catch (error) {
            console.error('Error sending status:', error);
            throw error;
        }
    }

    /**
     * Send a formatted table (header row + data rows)
     * @param {string} jid 
     * @param {string} title 
     * @param {Array<string>} headers 
     * @param {Array<Array<string>>} rows 
     * @param {object} [quoted=null] 
     * @param {object} [options={}] 
     */
    async sendTable(jid, title, headers, rows, quoted = null, options = {}) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        return await this.sock.sendTable(jid, title, headers, rows, quoted, { ai: this.ai, ...options });
    }

    /**
     * Send a bulleted / single-column list (Rich AI)
     * @param {string} jid 
     * @param {string} title 
     * @param {Array} items 
     * @param {object} [quoted=null] 
     * @param {object} [options={}] 
     */
    async sendRichList(jid, title, items, quoted = null, options = {}) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        return await this.sock.sendList(jid, title, items, quoted, { ai: this.ai, ...options });
    }

    /**
     * Send a syntax-highlighted code block
     * @param {string} jid 
     * @param {string} code 
     * @param {object} [quoted=null] 
     * @param {object} [options={}] 
     */
    async sendCodeBlock(jid, code, quoted = null, options = {}) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        return await this.sock.sendCodeBlock(jid, code, quoted, { ai: this.ai, ...options });
    }

    /**
     * Send LaTeX expressions as text
     * @param {string} jid 
     * @param {object} [quoted=null] 
     * @param {object} [options={}] 
     */
    async sendLatex(jid, quoted = null, options = {}) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        if (quoted && !quoted.key && (quoted.expressions || quoted.text || quoted.headerText || quoted.footer)) {
            options = quoted;
            quoted = null;
        }

        const submessages = [];
        if (options.headerText) {
            submessages.push({ messageType: 2, messageText: options.headerText });
        }

        const latexExpressions = (options.expressions || []).map(expr => {
            const entry = {
                latexExpression: expr.latexExpression,
                url: expr.url,
                width: expr.width,
                height: expr.height
            };
            if (expr.fontHeight !== undefined) entry.fontHeight = expr.fontHeight;
            if (expr.imageTopPadding !== undefined) entry.imageTopPadding = expr.imageTopPadding;
            if (expr.imageLeadingPadding !== undefined) entry.imageLeadingPadding = expr.imageLeadingPadding;
            if (expr.imageBottomPadding !== undefined) entry.imageBottomPadding = expr.imageBottomPadding;
            if (expr.imageTrailingPadding !== undefined) entry.imageTrailingPadding = expr.imageTrailingPadding;
            return entry;
        });

        submessages.push({ messageType: 8, latexMetadata: { text: options.text || '', expressions: latexExpressions } });

        if (options.footer) {
            submessages.push({ messageType: 2, messageText: options.footer });
        }

        return await this.sock.sendRichMessage(jid, submessages, quoted, { ai: this.ai, ...options });
    }

    /**
     * Render a LaTeX expression to a PNG image using the online CodeCogs API, upload, and send.
     * @param {string} jid 
     * @param {object} [quoted=null] 
     * @param {object|string} [options={}] LaTeX string OR options object: { formula/latex/text/expressions, caption }
     */
    async sendLatexImage(jid, quoted = null, options = {}) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        if (quoted && !quoted.key && (quoted.expressions || quoted.text || quoted.headerText || quoted.footer || typeof quoted === 'string' || (Array.isArray(quoted) && quoted.length > 0))) {
            options = quoted;
            quoted = null;
        }
        const latexOptions = typeof options === 'string' ? options : { ai: this.ai, ...options };
        return await this.sock.sendLatexImage(jid, quoted, latexOptions);
    }

    /**
     * Render multiple LaTeX expressions as an album message.
     * @param {string} jid 
     * @param {object} [quoted=null] 
     * @param {object|string} [options={}] LaTeX string OR options object: { expressions, caption }
     */
    async sendLatexInlineImage(jid, quoted = null, options = {}) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        if (quoted && !quoted.key && (quoted.expressions || quoted.text || quoted.headerText || quoted.footer || typeof quoted === 'string' || (Array.isArray(quoted) && quoted.length > 0))) {
            options = quoted;
            quoted = null;
        }
        const latexOptions = typeof options === 'string' ? options : { ai: this.ai, ...options };
        return await this.sock.sendLatexInlineImage(jid, quoted, latexOptions);
    }

    /**
     * Send a rich markdown text message
     * @param {string} jid 
     * @param {string} text 
     * @param {object} [quoted=null] 
     */
    async sendMarkdown(jid, text, quoted = null) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        return await this.sock.sendMarkdown(jid, text, quoted);
    }

    /**
     * Send a fully custom rich message by assembling raw submessage objects
     * @param {string} jid 
     * @param {Array<object>} messages 
     * @param {object} [quoted=null] 
     * @param {object} [options={}] 
     */
    async sendRichMessage(jid, messages, quoted = null, options = {}) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        return await this.sock.sendRichMessage(jid, messages, quoted, { ai: this.ai, ...options });
    }

    /**
     * Capture a unified response from an incoming Meta AI message
     * @param {object} message 
     */
    captureUnifiedResponse(message) {
        if (!this.sock) throw new Error('Client is not initialized');
        return this.sock.captureUnifiedResponse(message);
    }

    /**
     * Send a captured unified response
     * @param {string} jid 
     * @param {object} [quoted=null] 
     * @param {object} captured 
     */

    async sendUnifiedResponse(jid, quoted = null, captured) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        return await this.sock.sendUnifiedResponse(jid, quoted, captured, { ai: this.ai });
    }

    async sendGroupStatus(jid, content = {}, options = {}) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        if (!jid || typeof jid !== 'string' || !jid.endsWith('@g.us')) {
            throw new Error('Invalid group JID. Expected a JID ending with @g.us');
        }

        if (!content || typeof content !== 'object') {
            throw new Error('Invalid content. Expected an object');
        }

        return await this.sock.sendMessage(jid, { ...content, groupStatus: true }, options);
    }
}

function formatCode(code) {
    if (typeof code === 'string' && code.length === 8) {
        return code.slice(0, 4) + ' - ' + code.slice(4);
    }
    return code;
}

module.exports = {
    WhatsAppClient: WhatsAppClient,
    Group: Group,
    STATUS_BACKGROUNDS,
    STATUS_FONTS,
    renderLatexToPng,
    uploadUnencryptedToWA,
    RichSubMessageType
}