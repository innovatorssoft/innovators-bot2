const fs = require('fs');
const path = require('path');
const mime = require('mime');
const {
    generateInteractiveButtonMessage,
    generateInteractiveListMessage,
    generateCombinedButtons,
    generateCopyCodeButton,
    generateUrlButtonMessage,
    generateQuickReplyButtons
} = require('@innovatorssoft/baileys');

const MessageManager = {
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
    },

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
                    };
                    break;

                // Handle audio files
                case '.mp3':
                case '.ogg':
                case '.wav':
                case '.m4a':
                case '.aac':
                case '.opus':
                case '.flac':
                case '.wma':
                case '.oga':
                    const isPtt = Boolean(options.asVoiceNote || options.ptt);
                    let audioData = fileBuffer;
                    let audioMime = 'audio/mp4';

                    if (isPtt) {
                        // Convert audio to OGG (Opus codec) for WhatsApp Voice Note (PTT)
                        audioData = await this.convertToOgg(fileBuffer);
                        audioMime = 'audio/ogg; codecs=opus';
                    } else if (fileExtension === '.ogg' || fileExtension === '.opus' || fileExtension === '.oga') {
                        audioMime = 'audio/ogg; codecs=opus';
                    }

                    mediaMessage = {
                        audio: audioData,
                        mimetype: audioMime,
                        ptt: isPtt
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
    },

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
    },

    /**
     * Send a message with interactive buttons
     * @param {string} chatId - The ID of the chat to send the message to
     * @param {object} options - Options for the button message
     * @param {object} [extraOptions={}] - Additional options for the message
     * @returns {Promise<object>} The sent message info
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
    },

    /**
     * Send an interactive list message
     * @param {string} chatId - The ID of the chat to send the list to
     * @param {object} listOptions - Options for the list message
     * @returns {Promise<object>} The sent message info
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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

    /**
     * Send Buttons Cards Message
     * @param {string} jid - Target JID
     * @param {object} options - Cards options (text, title, subtitle, footer, cards)
     */
    async sendcards(jid, options) {
        jid = this._normalizeJid(jid);
        if (!this.isConnected) throw new Error('Client is not connected');
        return await this.sock.sendMessage(jid, options, { ai: this.ai });
    },

    /**
     * Send an external ad reply with a local image
     * @param {string} number - The phone number to send the ad to
     * @param {string} msg - Message text
     * @param {string} imgpath - Path to the local image file
     * @param {string} title - Title of the ad
     * @param {string} body - Body of the ad
     * @param {string} sourceurl - URL for ad attribution
     * @returns {Promise<void>}
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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

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
    },

    /**
     * Capture a unified response from an incoming Meta AI message
     * @param {object} message 
     */
    captureUnifiedResponse(message) {
        if (!this.sock) throw new Error('Client is not initialized');
        return this.sock.captureUnifiedResponse(message);
    },

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
    },

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
};

module.exports = MessageManager;
