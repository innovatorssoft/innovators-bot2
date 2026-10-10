const { voipDiagnostics } = require('@innovatorssoft/baileys');

const CallManager = {
    /**
     * Reject an incoming call
     * @param {string} callId - The ID of the call to reject
     * @param {string|object} [callFromOrReason='declined'] - Caller JID, reason, or call info object
     * @param {string} [reason='declined'] - Reason for rejection if callFrom is specified
     * @returns {Promise<void>}
     */
    async rejectCall(callId, callFromOrReason = 'declined', reason = 'declined') {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            let callFrom;
            let finalReason = reason;
            if (typeof callFromOrReason === 'string' && (callFromOrReason.includes('@') || callFromOrReason.includes(':'))) {
                callFrom = this._normalizeJid(callFromOrReason);
            } else if (typeof callFromOrReason === 'string') {
                finalReason = callFromOrReason;
                callFrom = undefined;
            } else {
                callFrom = callFromOrReason;
            }
            return await this.sock.rejectCall(callId, callFrom, finalReason);
        } catch (error) {
            console.error('Error rejecting call:', error);
            throw error;
        }
    },

    /**
     * Initiate an outgoing WhatsApp voice or video call with WebAssembly audio/video transport
     * Streams audio files (MP3/WAV/etc.) via FFmpeg into isolated 16 kHz Float32 PCM audio pipelines
     * and streams video files (MP4) with configurable fps, resolution, loop, and orientation.
     * 
     * Emits real-time call lifecycle events:
     * 'ringing', 'accepted', 'connected', 'audioReady', 'streaming', 'audio', 'ended', 'error', 'stateChange'
     * (and 'videoStarted', 'videoEnded' for video calls)
     * 
     * @param {string} jid - Target JID (phone number, WhatsApp JID, or LID)
     * @param {object} [options={}] - Call options object
     * @param {string} [options.audioSource] - Audio file path (MP3/WAV/etc.) or "silence"
     * @param {number} [options.durationMs] - Maximum playback duration in ms
     * @param {boolean} [options.repeatAudio=false] - Loop audio seamlessly until durationMs is reached
     * @param {number} [options.preRingingTimeoutMs=20000] - Timeout if recipient never reaches ringing
     * @param {boolean} [options.isVideo=false] - Whether this is a video call
     * @param {string} [options.videoSource] - Video file path (MP4/etc.) for video streaming
     * @param {number} [options.videoWidth] - Video width (default: 640)
     * @param {number} [options.videoHeight] - Video height (default: 480)
     * @param {number} [options.videoFps] - Video frames per second (default: 15)
     * @param {boolean} [options.isHorizontal=false] - true for horizontal (landscape), false for portrait
     * @param {boolean} [options.videoLoop=false] - Loop video seamlessly
     * @returns {Promise<EventEmitter>} ActiveCall event emitter handling call lifecycle events
     * @throws {Error} If client is not connected or call fails
     */
    async initiateCall(jid, options = {}) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        if (!jid.includes('@')) {
            jid = `${jid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        }

        if (jid.endsWith("@s.whatsapp.net")) {
            const isWhatsapp = await this.isNumberOnWhatsApp(jid);
            if (isWhatsapp) {
                let lid = await this.getLIDForPN(jid);
                if (lid) {
                    jid = lid;
                }
            } else {
                throw new Error('Number is not on WhatsApp');
            }
        }

        jid = this._normalizeJid(jid);

        try {
            return await this.sock.initiateCall(jid, options);
        } catch (error) {
            console.error('Error initiating call:', error);
            throw error;
        }
    },

    /**
     * Initiate batch concurrent outgoing WhatsApp calls
     * 
     * @param {Array<{ jid?: string, phoneNumber?: string, options?: object }>} callRequests - Array of call requests
     * @returns {Promise<Array<EventEmitter>>} Array of ActiveCall instances
     * @throws {Error} If client is not connected or initiateCalls fails
     */
    async initiateCalls(callRequests) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        if (!Array.isArray(callRequests) || callRequests.length === 0) {
            throw new Error('callRequests must be a non-empty array of call requests');
        }

        try {
            const preparedRequests = [];
            for (const req of callRequests) {
                let targetJid = req.jid || req.phoneNumber;
                if (!targetJid) {
                    throw new Error('Each call request must specify jid or phoneNumber');
                }

                if (!targetJid.includes('@')) {
                    targetJid = `${targetJid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
                }

                if (targetJid.endsWith('@s.whatsapp.net')) {
                    try {
                        const isWhatsapp = await this.isNumberOnWhatsApp(targetJid);
                        if (isWhatsapp) {
                            const lid = await this.getLIDForPN(targetJid);
                            if (lid) targetJid = lid;
                        }
                    } catch (_) {}
                }

                preparedRequests.push({
                    jid: this._normalizeJid(targetJid),
                    options: req.options || {}
                });
            }

            return await this.sock.initiateCalls(preparedRequests);
        } catch (error) {
            console.error('Error initiating concurrent calls:', error);
            throw error;
        }
    },

    /**
     * Get all currently active call summaries
     * @returns {Promise<Array<object>>} List of active call summaries
     */
    async getActiveCalls() {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        try {
            return await this.sock.getActiveCalls();
        } catch (error) {
            console.error('Error getting active calls:', error);
            throw error;
        }
    },

    /**
     * Get the count of currently active calls
     * @returns {Promise<number>} Active call count
     */
    async getActiveCallCount() {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        try {
            return await this.sock.getActiveCallCount();
        } catch (error) {
            console.error('Error getting active call count:', error);
            throw error;
        }
    },

    /**
     * Get an active call instance by call ID
     * @param {string} callId - The call ID
     * @returns {Promise<object|undefined>} Active call instance or undefined
     */
    async getCall(callId) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        try {
            return await this.sock.getCall(callId);
        } catch (error) {
            console.error('Error getting call:', error);
            throw error;
        }
    },

    /**
     * Terminate a single specific ongoing call
     * @param {string} callId - Call ID to end
     * @returns {Promise<void>}
     */
    async endCall(callId) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        try {
            return await this.sock.endCall(callId);
        } catch (error) {
            console.error('Error ending call:', error);
            throw error;
        }
    },

    /**
     * Terminate all active ongoing calls
     * @returns {Promise<void>}
     */
    async endAllCalls() {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        try {
            return await this.sock.endAllCalls();
        } catch (error) {
            console.error('Error ending all calls:', error);
            throw error;
        }
    },

    /**
     * Configure socket-level VoIP options (e.g. maxConcurrentCalls)
     * @param {object} options - VoIP configuration options
     * @param {number} [options.maxConcurrentCalls] - Maximum concurrent calls allowed
     * @returns {Promise<void>}
     */
    async setVoipOptions(options) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        try {
            return await this.sock.setVoipOptions(options);
        } catch (error) {
            console.error('Error setting VoIP options:', error);
            throw error;
        }
    },

    /**
     * Accept (answer) an incoming call
     * @param {string} callId - Call ID to accept
     * @param {string|object} [callFromOrOptions] - Caller JID or options object (e.g. { audio: './audio.mp3' })
     * @param {boolean} [isVideo=false] - Whether it is a video call
     * @param {object} [options={}] - Options if callFrom is provided as string
     * @returns {Promise<any>} Active call session or signaling result
     */
    async acceptCall(callId, callFromOrOptions, isVideo = false, options = {}) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        let callFrom = callFromOrOptions;
        let opt = options;
        if (typeof callFrom === 'object' && callFrom !== null) {
            opt = callFrom;
            callFrom = undefined;
        } else if (typeof callFrom === 'string') {
            callFrom = this._normalizeJid(callFrom);
        }
        try {
            return await this.sock.acceptCall(callId, callFrom, isVideo, opt);
        } catch (error) {
            console.error('Error accepting call:', error);
            throw error;
        }
    },

    /**
     * Get the underlying Baileys VoIP client instance
     * @returns {Promise<object>} The VoipClient instance
     */
    async getVoipClient() {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        try {
            return await this.sock.getVoipClient();
        } catch (error) {
            console.error('Error getting VoIP client:', error);
            throw error;
        }
    },

    /**
     * Get VoIP subsystem resource and memory stats
     * @returns {Promise<object>} VoIP memory stats
     */
    async getVoipMemoryStats() {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        try {
            return await this.sock.getVoipMemoryStats();
        } catch (error) {
            console.error('Error getting VoIP memory stats:', error);
            throw error;
        }
    },

    /**
     * Mute the microphone of an active call
     * @param {string} [callId] - Call ID to mute (defaults to active session)
     * @param {boolean} [mute=true] - true to mute, false to unmute
     * @returns {Promise<boolean>}
     */
    async muteCall(callId, mute = true) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        try {
            const voip = await this.sock.getVoipClient();
            const targetId = callId || this.lastIncomingSession?.callId || Array.from(voip?.calls?.values() || []).find(c => !c.ended)?.callId;
            if (!targetId) {
                throw new Error('No active call found to mute');
            }
            const session = voip?.calls?.get(targetId) || (this.lastIncomingSession?.callId === targetId ? this.lastIncomingSession : null);
            if (!session) {
                throw new Error(`Call session ${targetId} not found`);
            }
            session.mute(mute);
            return true;
        } catch (error) {
            console.error(`Error ${mute ? 'muting' : 'unmuting'} call:`, error);
            throw error;
        }
    },

    /**
     * Unmute the microphone of an active call
     * @param {string} [callId] - Call ID to unmute (defaults to active session)
     * @returns {Promise<boolean>}
     */
    async unmuteCall(callId) {
        return this.muteCall(callId, false);
    },

    /**
     * Send preaccept signal (codec capabilities) for an incoming call
     * @param {string} callId - Call ID
     * @param {string} callCreator - Caller JID
     * @param {boolean} [isVideo=false] - Whether it is a video call
     * @returns {Promise<void>}
     */
    async preacceptCall(callId, callCreator, isVideo = false) {
        callCreator = this._normalizeJid(callCreator);
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        try {
            return await this.sock.preacceptCall(callId, callCreator, isVideo);
        } catch (error) {
            console.error('Error preaccepting call:', error);
            throw error;
        }
    },

    /**
     * Offer a call (simple signaling only)
     * @param {string} jid - Target JID
     * @param {boolean} [isVideo=false] - Whether it is a video call
     * @returns {Promise<object>} Result of the call offer signaling
     * @throws {Error} If client is not connected or signaling fails
     */
    async offerCall(jid, isVideo = false) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            return await this.sock.offerCall(jid, isVideo);
        } catch (error) {
            console.error('Error offering call:', error);
            throw error;
        }
    },

    /**
     * Cancel an outgoing call
     * @param {string} callId - Call ID to cancel
     * @param {string} jid - Target JID
     * @returns {Promise<object>} Result of the cancel call operation
     * @throws {Error} If client is not connected or cancel fails
     */
    async cancelCall(callId, jid) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            return await this.sock.cancelCall(callId, jid);
        } catch (error) {
            console.error('Error canceling call:', error);
            throw error;
        }
    },

    /**
     * Enable or disable detailed VoIP diagnostic logging and tracing
     * @param {boolean} [enabled=true] - true to show detailed VoIP diagnostics logs, false to hide
     * @returns {boolean} Current diagnostic mode state
     */
    setVoipDiagnosticMode(enabled = true) {
        this.debugVoip = Boolean(enabled);
        if (typeof this.voip === 'object' && this.voip !== null) {
            this.voip.diagnostic = this.debugVoip;
        }
        if (voipDiagnostics && typeof voipDiagnostics.setDiagnosticMode === 'function') {
            voipDiagnostics.setDiagnosticMode(this.debugVoip);
        }
        if (this.debugVoip) {
            console.log('\n======================================================');
            console.log('🔍 [VoIP Diagnostics] Detailed VoIP Diagnostics & Tracing ENABLED');
            console.log('======================================================\n');
        } else {
            console.log('🔍 [VoIP Diagnostics] Detailed VoIP Diagnostics & Tracing DISABLED');
        }
        return this.debugVoip;
    },

    /**
     * Check if VoIP diagnostic mode is currently enabled
     * @returns {boolean}
     */
    isVoipDiagnosticMode() {
        if (voipDiagnostics && typeof voipDiagnostics.isDiagnosticMode === 'function') {
            return voipDiagnostics.isDiagnosticMode();
        }
        return Boolean(this.debugVoip);
    },

    /**
     * Get the Baileys voipDiagnostics singleton instance
     * @returns {object|null}
     */
    getVoipDiagnostics() {
        return voipDiagnostics || null;
    },

    /**
     * Get recorded timeline events for a VoIP call
     * @param {string} callId - Call ID
     * @returns {Array<object>} Array of timeline event entries
     */
    getVoipTimeline(callId) {
        if (voipDiagnostics && typeof voipDiagnostics.getTimeline === 'function') {
            return voipDiagnostics.getTimeline(callId);
        }
        return [];
    },

    /**
     * Format the recorded event timeline for a VoIP call into a human-readable string
     * @param {string} callId - Call ID
     * @returns {string} Formatted timeline string
     */
    formatVoipTimeline(callId) {
        if (voipDiagnostics && typeof voipDiagnostics.formatTimeline === 'function') {
            return voipDiagnostics.formatTimeline(callId);
        }
        return `[VOIP TIMELINE] callId=${callId} (diagnostics not available)`;
    },

    /**
     * Dump formatted call timeline to diagnostics logger/console
     * @param {string} callId - Call ID
     * @param {string} [level='info'] - Log level ('info', 'warn', 'debug')
     * @returns {string} Formatted timeline string
     */
    dumpVoipTimeline(callId, level = 'info') {
        if (voipDiagnostics && typeof voipDiagnostics.dumpTimeline === 'function') {
            return voipDiagnostics.dumpTimeline(callId, level);
        }
        const formatted = this.formatVoipTimeline(callId);
        console.log(formatted);
        return formatted;
    },

    /**
     * Clear recorded timeline events for a call
     * @param {string} callId - Call ID
     */
    clearVoipTimeline(callId) {
        if (voipDiagnostics && typeof voipDiagnostics.clearTimeline === 'function') {
            voipDiagnostics.clearTimeline(callId);
        }
    }
};

module.exports = CallManager;
