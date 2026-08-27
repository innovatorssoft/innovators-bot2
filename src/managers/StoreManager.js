const fs = require('fs');
const path = require('path');
const {
    createMessageStoreHandler,
    getAggregateVotesInPollMessage
} = require('@innovatorssoft/baileys');

const StoreManager = {
    /**
     * Get all stored messages for a specific chat
     * @param {string} chatId - The JID of the chat
     * @returns {Array} Array of stored messages (WebMessageInfo)
     */
    getStoredMessages(chatId) {
        return this.messageStore.getChatMessages(chatId);
    },

    /**
     * Get a specific stored message by its key
     * @param {object} key - The message key { remoteJid, id, fromMe }
     * @returns {object|undefined} The stored message (WebMessageInfo)
     */
    getStoredMessage(key) {
        return this.messageStore.getOriginalMessage(key);
    },

    /**
     * Get statistics about the message store
     * @returns {object} Store statistics
     */
    getStoreStats() {
        return this.messageStore.getStats();
    },

    /**
     * Get all stored messages from all chats
     * @returns {Array} Array of all stored messages
     */
    getAllStoredMessages() {
        return this.messageStore.getChatIds().flatMap(chatId => this.messageStore.getChatMessages(chatId));
    },

    /**
     * Get IDs of all chats that have stored messages
     * @returns {Array<string>} Array of chat JIDs
     */
    getStoredChatIds() {
        return this.messageStore.getChatIds();
    },

    /**
     * Clear the entire message store
     */
    clearMessageStore() {
        this.messageStore.clear();
        this.emit('store-cleared');
    },

    /**
     * Clear stored messages for a specific chat
     * @param {string} chatId - The JID of the chat to clear
     */
    clearChatStore(chatId) {
        this.messageStore.clearChat(chatId);
        this.emit('chat-store-cleared', chatId);
    },

    /**
     * Save the message store to a JSON file
     * @returns {Promise<{success: boolean, path?: string, messageCount?: number, savedAt?: Date, error?: string}>}
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
    },

    /**
     * Load the message store from a JSON file
     * @returns {Promise<{success: boolean, messageCount?: number, loadedFrom?: string, reason?: string, error?: string}>}
     */
    async loadMessageStore() {
        try {
            if (!fs.existsSync(this.messageStoreFilePath)) {
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
    },

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
                    await this.saveMessageStore();
                }
            }, this.autoSaveInterval);
        }
    },

    /**
     * Stop auto-save timer
     * @private
     */
    _stopAutoSave() {
        if (this._autoSaveTimer) {
            clearInterval(this._autoSaveTimer);
            this._autoSaveTimer = null;
        }
    },

    /**
     * Increment the store change counter (called when messages are added)
     * @private
     */
    _incrementStoreChangeCount() {
        this._storeChangeCount++;
    },

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
};

module.exports = StoreManager;
