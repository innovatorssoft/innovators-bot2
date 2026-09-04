const CallManager = {
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
     * @param {string} callFrom - Caller JID
     * @param {boolean} [isVideo=false] - Whether it is a video call
     * @returns {Promise<void>}
     */
    async acceptCall(callId, callFrom, isVideo = false) {
        callFrom = this._normalizeJid(callFrom);
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        try {
            return await this.sock.acceptCall(callId, callFrom, isVideo);
        } catch (error) {
            console.error('Error accepting call:', error);
            throw error;
        }
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
    }
};

module.exports = CallManager;
