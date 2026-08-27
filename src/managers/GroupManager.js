const Group = require('../structures/Group');

const GroupManager = {
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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

    /**
     * Send status update to a group
     * @param {string} jid 
     * @param {object} content 
     * @param {object} options 
     */
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
    },

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
    },

    /**
     * Update group metadata in cache
     * @param {string} jid - The group JID
     * @param {object} metadata - The group metadata
     */
    updateGroupMetadataCache(jid, metadata) {
        if (this.groupMetadataCache) {
            this.groupMetadataCache.set(jid, metadata);
        }
    },

    /**
     * Clear group metadata from cache
     * @param {string} jid - The group JID
     */
    clearGroupMetadataCache(jid) {
        if (this.groupMetadataCache) {
            this.groupMetadataCache.del(jid);
        }
    },

    /**
     * Clear all group metadata from cache
     */
    clearAllGroupMetadataCache() {
        if (this.groupMetadataCache) {
            this.groupMetadataCache.flushAll();
        }
    }
};

module.exports = GroupManager;
