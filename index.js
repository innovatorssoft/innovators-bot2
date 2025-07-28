const { makeWASocket, 
        useMultiFileAuthState, 
        DisconnectReason, 
        fetchLatestBaileysVersion } = 
require('@itsukichan/baileys');
const { Boom } = require('@hapi/boom');
const { EventEmitter } = require('events');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const mime = require('mime');
const figlet = require('figlet');
const readline = require('readline');

let rl;
const question = (text) => {
    if (rl && !rl.closed) {
        return new Promise((resolve) => rl.question(text, resolve));
    }
    
    // Recreate readline interface if it's closed or doesn't exist
    rl = readline.createInterface({ 
        input: process.stdin, 
        output: process.stdout 
    });
    
    return new Promise((resolve) => rl.question(text, resolve));
};

process.title = 'INNOVATORS Soft WhatsApp Server 92 322 4559543'

console.log(figlet.textSync('WELCOME To'))
console.log(figlet.textSync('INNOVATORS'))
console.log(figlet.textSync('SOFT'))
console.log(figlet.textSync('PRO'))
console.log(figlet.textSync('PAKISTANI'))


class Group {
    constructor(client, groupData) {
        this.client = client
        this.id = groupData.id
        this.subject = groupData.subject
        this.creation = groupData.creation
        this.owner = groupData.owner
        this.desc = groupData.desc
        this.participants = groupData.participants
    }
}


class WhatsAppClient extends EventEmitter {
    constructor(config = {}) {
        super()
        this.sock = null
        this.isConnected = false
        this.sessionName = config.sessionName || 'auth_info_baileys'
        this._connectionState = 'disconnected' // Track connection state
        this.authmethod = config.authmethod || 'qr'; // 'qr' or 'pairing'
        this._reconnectDelay = 5000; // 5 seconds
    }

    async connect() {
        try {
            // Force emit 'connecting' at beginning of connection attempt
            if (this._connectionState !== 'connecting') {
                this._connectionState = 'connecting';
                this.emit('connecting', 'Connecting to WhatsApp...');
            }

            const { version, isLatest } = await fetchLatestBaileysVersion();
            console.log(`Using WA version v${version.join('.')}, is latest: ${isLatest}`);

            const { state, saveCreds } = await useMultiFileAuthState(this.sessionName)
            const logger = P({ level: 'silent' })

            this.sock = makeWASocket({
                printQRInTerminal: this.authmethod === 'qr',
                auth: state,
                logger,
                markOnlineOnConnect: true, 
                syncFullHistory: true,
                linkPreviewImageThumbnailWidth: 192
            });

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr, isNewLogin, isOnline } = update;

                if (qr && this.authmethod === 'qr') {
                    this.emit('qr', qr);
                }
                if (connection === 'open') {
                    if (this._connectionState !== 'connected') {
                        if (this.sock?.user) {
                            const user = this.sock.user;
                            const userInfo = {
                                id: user.id,
                                name: user.name || user.notify || 'Unknown',
                                phone: user.id.split(':')[0],
                                platform: user.platform || 'Unknown',
                                isOnline: true
                            };

                            this.isConnected = true;
                            this._connectionState = 'connected';
                            this.emit('connected', userInfo);
                        }
                    }
                }
                else if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error instanceof Boom) ? 
                        lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut : true;

                    if (this._connectionState !== 'disconnected') {
                        this.isConnected = false;
                        this._connectionState = 'disconnected';
                        this.emit('disconnected', lastDisconnect?.error);
                    }

                    if (shouldReconnect) {
                        this.connect();
                    } else if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                        await this.reinitialize();
                    }
                }
                if (this.authmethod === 'pairing' && !state.creds?.registered) {
                    const phoneNumber = await question("📱 Enter your WhatsApp number (with country code): ");
                    await this.sock.requestPairingCode(phoneNumber.trim());
                    setTimeout(() => {
                        const code = this.sock.authState.creds?.pairingCode;
                        if (code) {
                          console.log("\n🔗 Pair this device using this code in WhatsApp:\n");
                          console.log("   " + code + "\n");
                          console.log("Go to WhatsApp → Linked Devices → Link with code.");
                        } else {
                          console.log("❌ Pairing code not found.");
                        }
                      }, 1000);                
                }
            })
            /**
             * Handle incoming messages
             * @emits WhatsAppClient#message - When a new message is received
             * @param {object} update - The message update object
             */
            this.sock.ev.on('messages.upsert', async (update) => {
                try {
                    // Skip if no messages or not a notification
                    if (!update.messages || update.messages.length === 0 || update.type !== 'notify') {
                        return;
                    }

                    const [message] = update.messages;
                    
                    // Skip messages sent by the bot itself
                    if (message.key.fromMe) {
                        return;
                    }

                    /**
                     * Extract message text from different possible locations in the message object
                     * @type {string}
                     */
                    let messageText = '';
                    let isButtonResponse = false;

                    // Check for list response first
                    if (message.message?.listResponseMessage) {
                        messageText = message.message.listResponseMessage.title || 
                                    message.message.listResponseMessage.description || '';
                        isButtonResponse = true;
                    } 
                    // Check for button response
                    else if (message.message?.templateButtonReplyMessage) {
                        messageText = message.message.templateButtonReplyMessage.selectedDisplayText || 
                                    message.message.templateButtonReplyMessage.selectedId || '';
                        isButtonResponse = true;
                    } 
                    // Check for classic button response
                    else if (message.message?.buttonsResponseMessage) {
                        messageText = message.message.buttonsResponseMessage.selectedDisplayText || 
                                    message.message.buttonsResponseMessage.selectedButtonId || '';
                        isButtonResponse = true;
                    } 
                    // Regular message
                    else {
                        messageText = message.message?.conversation ||
                                    message.message?.extendedTextMessage?.text ||
                                    message.message?.imageMessage?.caption ||
                                    message.message?.videoMessage?.caption ||
                                    '';
                    }

                    /** @type {string|null} */
                    let buttonType = null;
                    /** @type {string} */
                    let buttonText = '';

                    // Determine message type and extract relevant data
                    const { message: msg } = message;

                    // Check for different types of button messages
                    if (msg?.buttonsMessage) {
                        buttonType = 'classic_buttons';
                    } 
                    // Check for hydrated template messages
                    else if (msg?.templateMessage?.hydratedTemplate?.hydratedButtons) {
                        buttonType = 'classic_buttons_hydrated';
                    } 
                    // Check for different types of hydrated four row templates
                    else if (msg?.templateMessage?.hydratedFourRowTemplate) {
                        const template = msg.templateMessage.hydratedFourRowTemplate;
                        
                        if (template.hydratedButtons) {
                            buttonType = 'template_buttons_hydrated';
                        } else if (template.title) {
                            buttonType = 'template_text_hydrated';
                        } else if (template.imageMessage) {
                            buttonType = 'template_image_hydrated';
                        } else if (template.videoMessage) {
                            buttonType = 'template_video_hydrated';
                        } else if (template.documentMessage) {
                            buttonType = 'template_document_hydrated';
                        }
                    }

                    // Handle interactive response messages
                    if (msg?.interactiveResponseMessage) {
                        const interactive = msg.interactiveResponseMessage;

                        if (interactive.nativeFlowResponse?.response?.reply) {
                            buttonType = 'interactive_buttons_modern_native_flow';
                            buttonText = interactive.nativeFlowResponse.response.reply;
                        } else if (interactive.reply) {
                            buttonType = 'interactive_buttons_modern_reply';
                            buttonText = interactive.reply;
                        } else if (interactive.buttonReplyMessage?.displayText) {
                            buttonType = 'interactive_buttons_modern_button_reply';
                            buttonText = interactive.buttonReplyMessage.displayText;
                        }
                    }

                    // Handle button and list responses
                    if (msg?.listResponseMessage) {
                        // Handle list response messages
                        buttonType = 'list_response';
                        buttonText = msg.listResponseMessage.title || '';
                        if (msg.listResponseMessage.description) {
                            buttonText = buttonText ? `${buttonText} - ${msg.listResponseMessage.description}` : msg.listResponse.description;
                        }
                    } else if (msg?.buttonsResponseMessage?.selectedButtonId) {
                        // Handle classic button responses
                        buttonType = 'classic_buttons';
                        buttonText = msg.buttonsResponseMessage.selectedDisplayText || 
                                    msg.buttonsResponseMessage.selectedButtonId || '';
                    } else if (msg?.templateButtonReplyMessage?.selectedId) {
                        // Handle template button replies
                        buttonType = 'template_button_reply';
                        buttonText = msg.templateButtonReplyMessage.selectedDisplayText || 
                                    msg.templateButtonReplyMessage.selectedId || '';
                    } else if (msg?.interactiveResponseMessage) {
                        // Handle interactive responses (including list selections)
                        const interactive = msg.interactiveResponseMessage;
                        if (interactive.listResponse) {
                            buttonType = 'list_selection';
                            buttonText = interactive.listResponse.title || interactive.listResponse.description || '';
                        } else if (interactive.nativeFlowResponse?.response?.reply) {
                            buttonType = 'interactive_buttons_modern_native_flow';
                            buttonText = interactive.nativeFlowResponse.response.reply;
                        }
                    }

                    // Prepare the message body - prioritize button/list responses over regular text
                    const messageBody = buttonText || messageText || 
                                     (msg?.listResponseMessage?.singleSelectReply?.selectedRowId) ||
                                     (msg?.listResponseMessage?.title) ||
                                     (msg?.listResponseMessage?.description) ||
                                     '';

                    // Emit the message event with all extracted data
                    this.emit('message', {
                        from: message.key.remoteJid,
                        body: messageText,
                        hasMedia: Boolean(msg?.imageMessage || msg?.videoMessage || msg?.audioMessage || msg?.documentMessage),
                        isGroup: message.key.remoteJid.endsWith('@g.us'),
                        timestamp: message.messageTimestamp ? new Date(message.messageTimestamp * 1000) : new Date(),
                        isButtonResponse: isButtonResponse,
                        buttonId: message.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
                                 message.message?.templateButtonReplyMessage?.selectedId || 
                                 message.message?.buttonsResponseMessage?.selectedButtonId || null,
                        buttonText: messageText,
                        raw: message,
                        reply: async (replyText) => {
                            try {
                                return await this.sock.sendMessage(
                                    message.key.remoteJid,
                                    { text: replyText },
                                    { quoted: message }
                                );
                            } catch (error) {
                                console.error('Error sending reply:', error);
                                throw error;
                            }
                        },
                    });
                } catch (error) {
                    console.error('Error processing message:', error);
                }
            });
            // Handle incoming calls
            this.sock.ev.on('call', async (call) => {
                try {
                    await this.emit('call', call);
                } catch (error) {
                    console.error('Error in call handler:', error);
                    this.emit('error', error);
                }
            });

            // Handle credential updates
            this.sock.ev.on('creds.update', saveCreds);

			} catch (error) {
				console.error('Error in connect:', error);
				this.emit('error', error);
				throw error;
			}
    }

    /**
     * Send a message to a chat
     * @param {string} chatId - The ID of the chat to send the message to
     * @param {string|object} message - The message content (string) or message object
     * @param {object} options - Additional options for sending the message
     * @returns {Promise<object>} The sent message info
     * @throws {Error} If client is not connected or message sending fails
     */
    async sendMessage(chatId, message, options = {}) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        let messageContent = {};

        // Handle different message types
        if (typeof message === 'string') {
            messageContent = { text: message };
        } else if (message && typeof message === 'object') {
            // Handle different message types
            switch (message.type) {
                case 'text':
                    messageContent = { text: message.text };
                    if (message.mentions) {
                        messageContent.mentions = message.mentions;
                    }
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
                            key: message.messageKey
                        }
                    };
                    break;

                default:
                    throw new Error('Invalid message type');
            }
        } else {
            throw new Error('Invalid message content');
        }

        try {
            return await this.sock.sendMessage(chatId, messageContent, options);
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }
    /**
     * Send a media file to a chat
     * @param {string} chatId - The ID of the chat to send the media to
     * @param {string} filePath - Path to the media file
     * @param {object} options - Additional options for the media message
     * @returns {Promise<object>} The sent message info
     * @throws {Error} If client is not connected or file not found
     */
    async sendMedia(chatId, filePath, options = {}) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }
        
        try {
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                throw new Error('File not found: ' + filePath);
            }

            const fileExtension = path.extname(filePath).toLowerCase();
            const caption = options.caption || '';
            let mediaMessage = {};
            
            // Handle different media types
            switch (fileExtension) {
                case '.gif':
                case '.mp4':
                    mediaMessage = {
                        video: fs.readFileSync(filePath),
                        caption: caption,
                        gifPlayback: options.asGif || fileExtension === '.gif',
                    }
                    break;

                // Handle audio files
                case '.mp3':
                case '.ogg':
                case '.wav':
                    mediaMessage = {
                        audio: {
                            url: filePath
                        },
                        mimetype: 'audio/mp4',
                    };
                    break;

                // Handle image files
                case '.jpg':
                case '.jpeg':
                case '.png':
                    mediaMessage = {
                        image: fs.readFileSync(filePath),
                        caption: caption,
                    };
                    break;

                default:
                    throw new Error('Unsupported file type: ' + fileExtension);
            }

            return await this.sock.sendMessage(chatId, mediaMessage);
        } catch (error) {
            console.error('Error sending media:', error);
            throw error;
        }
    }

    /**
     * Send a document to a chat
     * @param {string} chatId - The ID of the chat to send the document to
     * @param {string} filePath - Path to the document file
     * @param {string} [caption=''] - Optional caption for the document
     * @returns {Promise<object>} The sent message info
     * @throws {Error} If client is not connected or file not found
     */
    async sendDocument(chatId, filePath, caption = '') {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                throw new Error('File not found: ' + filePath);
            }

            const fileBuffer = fs.readFileSync(filePath);
            const fileName = path.basename(filePath);
            const mimeType = mime.getType(filePath);

            return await this.sock.sendMessage(chatId, {
                document: fileBuffer,
                caption: caption,
                mimetype: mimeType,
                fileName: fileName,
            });
        } catch (error) {
            console.error('Error sending document:', error);
            throw error;
        }
    }

    /**
     * Send a message with interactive buttons
     * @param {string} chatId - The ID of the chat to send the message to
     * @param {object} options - Options for the button message
     * @param {string} [options.text] - The text content of the message
     * @param {string} [options.imagePath] - Optional path to an image to include
     * @param {string} [options.caption] - Caption for the image
     * @param {string} [options.title] - Title for the message
     * @param {string} [options.footer] - Footer text for the message
     * @param {Array} [options.interactiveButtons=[]] - Array of button objects
     * @param {boolean} [options.hasMediaAttachment=false] - Whether the message has a media attachment
     * @param {object} [extraOptions={}] - Additional options for the message
     * @returns {Promise<object>} The sent message info
     * @throws {Error} If client is not connected or message sending fails
     */
    async sendButtons(chatId, options = {}, extraOptions = {}) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        const {
            text,
            imagePath,
            caption,
            title,
            footer,
            interactiveButtons = [],
            hasMediaAttachment = false,
        } = options;

        let messageContent = {};

        try {
            if (imagePath) {
                // Handle message with image
                const imageBuffer = fs.readFileSync(imagePath);
                messageContent = {
                    image: imageBuffer,
                    caption: caption,
                    title: title,
                    footer: footer,
                    interactiveButtons: interactiveButtons,
                    hasMediaAttachment: hasMediaAttachment,
                };
            } else {
                // Handle text-only message
                messageContent = {
                    text: text,
                    title: title,
                    footer: footer,
                    interactiveButtons: interactiveButtons,
                };
            }

            // Send the message with buttons
            return await this.sock.sendMessage(chatId, messageContent, extraOptions);
        } catch (error) {
            console.error('Error sending buttons:', error);
            throw error;
        }
    }

    /**
     * Send an interactive list message
     * @param {string} chatId - The ID of the chat to send the list to
     * @param {object} listOptions - Options for the list message
     * @param {string} listOptions.text - The text content of the message
     * @param {string} listOptions.title - Title of the list
     * @param {string} [listOptions.footer=''] - Optional footer text
     * @param {string} [listOptions.buttonText='Tap here'] - Text for the button
     * @param {Array<object>} listOptions.sections - Array of section objects
     * @returns {Promise<object>} The sent message info
     * @throws {Error} If client is not connected or message sending fails
     */
    async SendList(chatId, listOptions) {
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

            return await this.sock.sendMessage(chatId, listMessage);
        } catch (error) {
            console.error('Error sending list message:', error);
            throw error;
        }
    }
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
    }

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
            for (const participantId of participantIds) {
                const result = await this.sock.groupParticipantsUpdate(
                    groupId,
                    [participantId],
                    action
                );
                results.push(result);
            }
            return results;
        } catch (error) {
            console.error('Error updating group participants:', error);
            throw error;
        }
    }
    /**
     * Mark a message as read
     * @param {string} messageId - The ID of the message to mark as read
     * @returns {Promise<void>}
     * @throws {Error} If client is not connected or an error occurs
     */
    async readMessage(messageId) {
        if (!this.isConnected) {
            throw new Error('Client is not connected');
        }

        try {
            await this.sock.readMessages([messageId]);
        } catch (error) {
            console.error('Error marking message as read:', error);
            throw error;
        }
    }

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
    }

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
            if (error.message && error.message.includes('404')) {
                return undefined;
            }
            console.error('Error getting profile picture:', error);
            throw error;
        }
    }
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
            //console.log('Starting session reinitialization...');
            
            // Reset connection state
            this.isConnected = false;
            
            // Clear the session data if it exists
            if (fs.existsSync(this.sessionName)) {
                await fs.promises.rm(this.sessionName, {
                    recursive: true,
                    force: true,
                });
                //console.log('Cleared existing session data');
            }

            // Clear any existing socket
            if (this.sock) {
                try {
                    this.sock.ev.removeAllListeners();
                    await this.sock.end(undefined);
                } catch (e) {
                    console.error('Error while cleaning up socket:', e);
                }
                this.sock = null;
            }

            // Add a small delay before reconnecting
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Reconnect with a fresh session
            //console.log('Establishing new connection...');
            await this.connect(1); // Start with attempt 1
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
}
module.exports = {
    WhatsAppClient: WhatsAppClient,
    Group: Group,
}