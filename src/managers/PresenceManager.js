const fs = require('fs');
const {
    createTypingIndicator,
    StatusHelper,
    STATUS_BACKGROUNDS,
    STATUS_FONTS
} = require('@innovatorssoft/baileys');

const PresenceManager = {
    /**
     * Send typing indicator to a chat
     * @param {string} jid - The JID of the chat
     * @returns {Promise<void>}
     */
    async sendStateTyping(jid) {
        if (!this.sock) throw new Error('Not connected to WhatsApp');
        await this.sock.sendPresenceUpdate("composing", jid);
    },

    /**
     * Send recording indicator to a chat
     * @param {string} jid - The JID of the chat
     * @returns {Promise<void>}
     */
    async sendStateRecording(jid) {
        if (!this.sock) throw new Error('Not connected to WhatsApp');
        await this.sock.sendPresenceUpdate("recording", jid);
    },

    /**
     * Clear typing/recording indicator from a chat
     * @param {string} jid - The JID of the chat
     * @returns {Promise<void>}
     */
    async clearState(jid) {
        if (!this.sock) throw new Error('Not connected to WhatsApp');
        await this.sock.sendPresenceUpdate("paused", jid);
    },

    /**
     * Create a typing indicator controller for manual or standalone presence control
     * @returns {object} The typing indicator controller
     */
    createPresenceController() {
        if (!this.sock) throw new Error('Client is not connected');
        return createTypingIndicator(
            (jid, presence) => this.sock.sendPresenceUpdate(presence, jid)
        );
    },

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
};

module.exports = PresenceManager;
