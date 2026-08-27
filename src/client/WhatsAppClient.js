const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const P = require('pino');
const NodeCache = require('node-cache');
const {
    makeWASocket,
    Browsers,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    MessageStore,
    parseJid,
    plotJid,
    normalizePhoneToJid
} = require('@innovatorssoft/baileys');

const { registerSocketEvents } = require('../handlers/eventHandler');
const { resolveLidToPn, normalizeJid, handleMentions } = require('../utils/jid');

const MessageManager = require('../managers/MessageManager');
const GroupManager = require('../managers/GroupManager');
const PrivacyManager = require('../managers/PrivacyManager');
const CallManager = require('../managers/CallManager');
const PresenceManager = require('../managers/PresenceManager');
const MediaManager = require('../managers/MediaManager');
const StoreManager = require('../managers/StoreManager');

class WhatsAppClient extends EventEmitter {
    constructor(config = {}) {
        super();
        this.sock = null;
        this.isConnected = false;
        this.sessionName = config.sessionName || 'auth_info_baileys';
        this._connectionState = 'disconnected';
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
        return resolveLidToPn(this, jid);
    }

    /**
     * Normalize JID by removing device ID suffix (e.g., :0)
     * Converts 923014434335:0@s.whatsapp.net to 923014434335@s.whatsapp.net
     * @param {string} jid - The JID to normalize
     * @returns {string} Normalized JID
     * @private
     */
    _normalizeJid(jid) {
        return normalizeJid(jid);
    }

    /**
     * Internal helper to handle mentions and the "mention all" flag
     * @param {string[]} mentions - Array of JIDs or keywords like 'all'/'@all'
     * @param {boolean} mentionAll - Explicit mentionAll flag
     * @returns {object} Object containing processed mentions and mentionAll flag
     * @private
     */
    _handleMentions(mentions, mentionAll) {
        return handleMentions(mentions, mentionAll);
    }

    /**
     * Connect to WhatsApp
     * @returns {Promise<void>}
     */
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

            const { state, saveCreds } = await useMultiFileAuthState(this.sessionName);
            const logger = P({ level: 'silent' });

            this.sock = makeWASocket({
                auth: state,
                logger,
                markOnlineOnConnect: false,
                syncFullHistory: true,
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
                browser: Browsers.windows('Chrome'),
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

            // Register all event listeners
            registerSocketEvents(this, state, saveCreds);

        } catch (error) {
            console.error('Error in connect:', error);
            this.emit('error', error);
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
     * Reinitialize the WhatsApp client by clearing the session and reconnecting
     * @returns {Promise<void>}
     */
    async reinitialize() {
        try {
            // Reset connection state
            this.isConnected = false;

            // Clear the session data if it exists
            if (fs.existsSync(this.sessionName)) {
                await fs.promises.rm(this.sessionName, {
                    recursive: true,
                    force: true,
                });
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
            await this.connect(1);
            this.emit('reinitialized');
        } catch (error) {
            console.error('Error during reinitialization:', error);
            this.emit('error', error);
            throw error;
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
}

// Attach all managers to WhatsAppClient prototype for clean modular composition
Object.assign(
    WhatsAppClient.prototype,
    MessageManager,
    GroupManager,
    PrivacyManager,
    CallManager,
    PresenceManager,
    MediaManager,
    StoreManager
);

module.exports = WhatsAppClient;
