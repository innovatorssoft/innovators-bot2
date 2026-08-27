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
     * Initiate an outgoing WhatsApp voice call with WebAssembly audio transport
     * Streams audio files (MP3/WAV/etc.) via FFmpeg into 16 kHz Float32 PCM WASM audio engine.
     * Emits real-time call lifecycle events ('ringing', 'connected', 'audio', 'ended', 'error')
     * 
     * @param {string} jid - Target JID (phone number or WhatsApp JID)
     * @param {object} [options={}] - Options object
     * @param {string} [options.audioSource] - Audio file path (MP3/WAV/etc.) or "silence"
     * @param {number} [options.durationMs] - Optional duration in ms
     * @returns {Promise<EventEmitter>} Call event emitter handling ('ringing', 'connected', 'audio', 'ended', 'error')
     * @throws {Error} If client is not connected or call fails
     */
    async initiateCall(jid, options = {}) {
        if (jid.endsWith("@s.whatsapp.net")) {
            const isWhatsapp = await this.isNumberOnWhatsApp(jid);
            if (isWhatsapp) {
                let lid = await this.getLIDForPN(jid);
                console.log('LID for ' + jid + ' is: ' + this._normalizeJid(lid));
                jid = lid || jid;
            } else {
                throw new Error('Number is not on WhatsApp');
            }
        }

        jid = this._normalizeJid(jid);

        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        try {
            let call = await this.sock.initiateCall(jid, options);
            return call;
        } catch (error) {
            console.error('Error initiating call:', error);
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
