const PrivacyManager = {
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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
};

module.exports = PrivacyManager;
