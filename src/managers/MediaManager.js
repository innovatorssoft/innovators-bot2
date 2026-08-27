const mime = require('mime');
const { downloadMediaMessage } = require('@innovatorssoft/baileys');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { convertAudioToOgg } = require('../utils/audio');

const MediaManager = {
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
    },

    /**
     * Send a sticker with metadata
     * @param {string} chatId - Target chat JID
     * @param {Buffer} buffer - Sticker image/buffer
     * @param {object} metadata - Sticker metadata (packName, author, etc.)
     * @returns {Promise<object>} Sent message info
     */
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
    },

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
    },

    /**
     * Convert an audio Buffer or file to OGG format (Opus codec) for WhatsApp PTT (Voice Note)
     * @param {Buffer|string} input - Audio Buffer or file path
     * @returns {Promise<Buffer>} Converted OGG Opus audio buffer
     */
    async convertToOgg(input) {
        return await convertAudioToOgg(input);
    },

    /**
     * Convert an audio Buffer or file to OGG format (Opus codec) for WhatsApp PTT (Voice Note) - Alias
     * @param {Buffer|string} input - Audio Buffer or file path
     * @returns {Promise<Buffer>} Converted OGG Opus audio buffer
     */
    async toPTT(input) {
        return await convertAudioToOgg(input);
    }
};

module.exports = MediaManager;
