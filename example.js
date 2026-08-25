const { WhatsAppClient,
    STATUS_BACKGROUNDS,
    STATUS_FONTS,
    renderLatexToPng,
    uploadUnencryptedToWA,
    RichSubMessageType
} = require('./index')

const qrcode = require('qrcode-terminal')
const fs = require('fs');
const readline = require('readline');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

String.prototype.toTitleCase = function () {
    return this.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function start() {
    const sessionDir = ".Sessions";
    const hasSession = fs.existsSync(path.join(sessionDir, 'creds.json'));

    let authMethod = 'qr';
    let pairingPhoneNumber = null;

    if (!hasSession) {
        console.log('\n📱 WhatsApp Bot Setup');
        console.log('-------------------');
        console.log('1. QR Code');
        console.log('2. Pairing Code');

        const choice = await question('\nChoose authentication method (1 or 2): ');
        authMethod = choice === '2' ? 'pairing' : 'qr';

        if (authMethod === 'pairing') {
            pairingPhoneNumber = await question('Enter phone number for pairing (e.g. 923224559543): ');
            if (!pairingPhoneNumber) {
                console.log('❌ Phone number is required for pairing method.');
                process.exit(1);
            }
        }
    } else {
        console.log('\n🔄 Existing session found! Skipping setup...');
    }

    rl.close();

    const client = new WhatsAppClient({
        sessionName: sessionDir,
        authmethod: authMethod,
        pairingPhoneNumber: pairingPhoneNumber,
        ai: true, // Enable/Disable AI flag for outgoing messages (default: true)
        // Message store persistence configuration
        messageStoreFilePath: path.join(sessionDir, 'message-store.json'),
        autoSaveInterval: 5 * 60 * 1000, // Auto-save every 5 minutes
        maxMessagesPerChat: 1000, // Keep last 1000 messages per chat
        messageTTL: 24 * 60 * 60 * 1000 // Messages expire after 24 hours
    });

    console.log(`\n🚀 Initializing with ${authMethod} method...`);

    // Handle QR Code
    client.on('qr', qr => {
        console.log('\n✅ QR Code received. Scan it with WhatsApp:')
        qrcode.generate(qr, { small: true })
    })

    client.on('pairing-code', (code) => {
        console.log(`\n✅ Pairing code for ${pairingPhoneNumber}: ${code}`)
    })

    // Handle connection events
    client.on('connecting', (message) => {
        console.log('⏳ Client status:', message)
    })

    client.on('connected', (user) => {
        console.log('\n✨ Client is ready!')
        console.log('User:', user.name)
        console.log('Phone:', user.phone)
        console.log('Plateform:', user.platform)
        console.log('isOnline:', user.isOnline)
    })

    // Handle LID mapping updates
    client.on('lid-mapping-update', (update) => {
        console.log('📦 New LID/PN mappings received')
    })

    // Handle Contact Events
    client.on('contacts-received', (contacts) => {
        console.log(`\n👥 History Sync: Received ${contacts.length} contacts`);
    })

    client.on('contacts-upsert', (contacts) => {
        console.log(`\n👥 New Contacts: ${contacts.length} contacts added/updated`);
    })

    client.on('contacts-update', (updates) => {
        console.log(`\n👥 Contact Updates: ${updates.length} contacts modified`);
    })

    // Handle Anti-Delete system
    client.on('message-deleted', async (data) => {
        console.log(`\n🛡️ Message from ${data.jid} was deleted!`)
        await client.sendMessage(data.jid, '⚠️ I saw you deleted that message! I have it saved in my memory. 😉', { quoted: data.originalMessage });
    })
    // Example of listening to the new events
    client.on('message-stored', (messages) => {
        //console.log(`${messages.length} messages were just cached in the store.`);
    });

    client.on('store-loaded', (info) => {
        console.log(`\n💾 Message store loaded: ${info.messageCount} messages restored from file`);
    });

    client.on('store-cleared', () => {
        console.log('Main message store has been purged.');
    });
    // Handle message reactions
    client.on('message-reaction', async (reaction) => {
        console.log('\n👍 Message Reaction Received!')
        console.log('Chat:', reaction.from)
        console.log('Sender:', reaction.sender)
        console.log('Emoji:', reaction.emoji || '(removed)')
        console.log('Is Removed:', reaction.isRemoved)
        console.log('Message ID:', reaction.messageKey.id)
    })
    client.on('poll-votes-update', async (data) => {
        console.log('\n📊 Poll Votes Updated!');
        console.log('Chat:', data.jid);
        console.log('Voter:', data.voter);

        // 1. Extract Poll Creation Message (Question, Options, etc.)
        const pollCreation = data.pollCreationMessage;
        if (pollCreation && pollCreation.message) {
            const pollMessage = pollCreation.message.pollCreationMessage ||
                pollCreation.message.pollCreationMessageV2 ||
                pollCreation.message.pollCreationMessageV3;

            if (pollMessage) {
                console.log('\n📝 Poll Creation Details:');
                console.log('Question:', pollMessage.name);
                console.log('Options:', pollMessage.options?.map(o => o.optionName) || []);
            }
        }

        // 2. Extract voters array from pollUpdate
        console.log('\n🗳️ Vote Breakdown:');
        let totalVotesCount = 0;
        data.pollUpdate.forEach((option) => {
            console.log(`--> ${option.name}: ${option.voters.length} vote(s) ${JSON.stringify(option.voters)}`);
            totalVotesCount += option.voters.length;
        });
        console.log(`--> Total Votes Cast: ${totalVotesCount}`);
        const winner = data.pollUpdate.reduce((prev, current) =>
            prev.voters.length > current.voters.length ? prev : current);
        console.log(`--> The Winner Is ${winner.name} With ${winner.voters.length} votes`);
    });

    client.on('call', (call) => {
        const callData = call[0]; // Get the first call object from the array
        if (callData.status !== 'offer') return;
        console.log('\n📞 Call Received!')
        console.log('Chat ID:', callData.chatId)
        console.log('From:', callData.from)
        console.log('Call ID:', callData.id)
        console.log('Date:', callData.date)
        console.log('Offline:', callData.offline)
        console.log('Status:', callData.status)
        console.log('Is Video:', callData.isVideo)
        console.log('Is Group:', callData.isGroup)
        console.log('Phone Number:', callData.phoneNumber)
    })

    client.on('disconnected', (error) => {
        console.log('❌ Client disconnected')
    })

    client.on('group-left', (info) => {
        console.log(`Left group ${info.id}: ${info.reason}`);
    });

    // Connect to WhatsApp
    client.connect()

    client.on('status', async status => {

        console.log('Status Received');
        console.log('Number:', status.from);
        console.log('Sender:', status.raw.pushName);
        console.log('Message:', status.body);
        console.log('Has Media:', status.hasMedia);

        // Mark status as read using the complete message key

        //await client.readMessage(status.key);

        //Reply With Emoji
        //await status.reply('Liked Your Status! ❤️');

        await status.like('❤️');
        console.log('Status Seen! and Replied With Emoji')
    });

    // Listen for incoming messages
    let lastOutgoingCallId = null;
    let lastOutgoingCallJid = null;
    let autoCancelCallTimer = null;

    client.on('message', async msg => {

        if (msg.body === '') {
            return
        }


        console.log('Message Received');


        isGroupMsg = msg.isGroup
        if (isGroupMsg) {
            msgFrom = msg.from
        } else {
            msgFrom = msg.sender
        }

        console.log('Msg From:', msg.from);
        console.log('Msg Sender:', msg.sender);
        console.log('Sender Name:', msg.raw.pushName);
        console.log('Message:', msg.body);
        console.log('Is Group:', msg.isGroup);
        // Mark the message as read
        await client.readMessage(msg.raw.key)

        const command = msg.body.split(' ')[0].toLowerCase()
        const args = msg.body.split(' ').slice(1).join(' ')

        switch (command) {
            case '!ping':
                await client.sendMessage(msgFrom, 'Hello Pong! 🎊')
                break
            case '!poll':
                await client.sendMessage(msgFrom, '', {
                    poll: {
                        name: 'Which programming language do you like most?',
                        options: ['JavaScript', 'Python', 'C++', 'Java'],
                        selectableOptionsCount: 1,
                        messageId: 'poll1'
                    }
                });
                break
            case '!echo':
                if (args) {
                    await client.sendMessage(msgFrom, args)
                } else {
                    await client.sendMessage(msgFrom, 'Please provide text to echo')
                }
                break
            case '!mention':
                const number = msg.sender.split('@')[0]
                await client.sendMessage(msgFrom, {
                    type: 'text',
                    text: `Hey @${number}! How are you?`,
                    mentions: [number]
                })
                break
            case '!mentionall':
                if (!isGroupMsg) {
                    await client.sendMessage(msgFrom, 'This command is only for groups')
                    return
                }
                await client.sendMessage(msgFrom, {
                    type: 'text',
                    text: `Hey @all! How are you?`,
                    mentions: ['@all']
                })
                break
            case '!reply':
                await msg.reply('This is a reply message')
                break

            case '!location':
                await client.sendMessage(msgFrom, {
                    type: 'location',
                    latitude: 24.121231,
                    longitude: 55.1121221
                })
                break

            case '!contact':
                await client.sendMessage(msgFrom, {
                    type: 'contact',
                    fullName: 'John Doe',
                    organization: 'Example Corp',
                    phoneNumber: '1234567890'
                })
                break

            case '!react':
                await client.sendMessage(
                    msgFrom,
                    {
                        type: 'reaction',
                        emoji: '💖',
                        message: { key: msg.raw.key }
                    }
                )
                break
            case '!media':
                if (fs.existsSync('./example.jpg')) {
                    await client.sendMedia(msgFrom, './example.jpg', {
                        caption: 'Check out this image!'
                    })
                } else {
                    await client.sendMessage(msgFrom, 'Example image not found')
                }
                break

            case '!urlimage':
                try {
                    const integrationFormula = '\\dpi{900}\\int\\frac{1}{x}dx=\\ln\\left|x\\right|+C';
                    const mediaurl = `https://latex.codecogs.com/png.image?${encodeURIComponent(integrationFormula)}`;
                    await client.sendMedia(msgFrom, mediaurl, {
                        caption: 'Check out this image!'
                    })
                } catch (error) {
                    await client.sendMessage(msgFrom, `Failed to send image from URL: ${error.message}`)
                }
                break

            case '!doc':
                if (fs.existsSync('./example.pdf')) {
                    await client.sendDocument(msgFrom, './example.pdf', 'Check out this document!')
                } else {
                    await client.sendMessage(msgFrom, 'Example document not found')
                }
                break

            case '!audio':
                const regularAudio = fs.existsSync('./example.mp3') ? './example.mp3' :
                    (fs.existsSync('./audio.mp3') ? './audio.mp3' : null);
                if (regularAudio) {
                    await client.sendMedia(msgFrom, regularAudio);
                } else {
                    await client.sendMessage(msgFrom, 'Audio file not found (place example.mp3 or audio.mp3)');
                }
                break

            case '!voicenote':
            case '!ptt':
                const voiceAudio = fs.existsSync('./example.mp3') ? './example.mp3' :
                    (fs.existsSync('./audio.mp3') ? './audio.mp3' :
                    (fs.existsSync('./example.wav') ? './example.wav' :
                    (fs.existsSync('./voice.ogg') ? './voice.ogg' : null)));
                if (voiceAudio) {
                    // Send as PTT Voice Note - automatically converts audio to OGG Opus
                    await client.sendMedia(msgFrom, voiceAudio, {
                        asVoiceNote: true
                    });
                } else {
                    await client.sendMessage(msgFrom, 'Audio file not found (place example.mp3, audio.mp3, or example.wav)');
                }
                break

            case '!list':
                await client.SendList(msgFrom, {
                    text: 'Please select an option from the list below:',
                    title: 'Comprehensive Menu',
                    buttonText: 'View All Options',
                    footer: 'Scroll to see more options',
                    sections: [
                        {
                            title: 'Main Options',
                            rows: [
                                { title: 'Account Settings', id: 'account_settings', description: 'Manage your account preferences' },
                                { title: 'Profile', id: 'profile', description: 'View and edit your profile' },
                                { title: 'Notifications', id: 'notifications', description: 'Configure notification settings' },
                                { title: 'Privacy', id: 'privacy', description: 'Privacy and security settings' },
                                { title: 'Security', id: 'security', description: 'Security and login options' },
                                { title: 'Payments', id: 'payments', description: 'Manage payment methods' },
                                { title: 'Subscriptions', id: 'subscriptions', description: 'View your subscriptions' },
                            ]
                        },
                        {
                            title: 'More Options',
                            rows: [
                                { title: 'Themes', id: 'themes', description: 'Change app appearance' },
                                { title: 'Font Size', id: 'font_size', description: 'Adjust text size' },
                                { title: 'Dark Mode', id: 'dark_mode', description: 'Toggle dark theme' },
                                { title: 'Offline Mode', id: 'offline', description: 'Use without internet' },
                                { title: 'Data Saver', id: 'data_saver', description: 'Reduce data usage' },
                                { title: 'Storage', id: 'storage', description: 'Manage local storage' },
                                { title: 'Cache', id: 'cache', description: 'Clear cached data' },
                            ]
                        }
                    ]
                })
                break
            case '!buttons':
                // Example: Send a text interactive message (modern Baileys format)
                await client.sendButtons(msgFrom, {
                    text: 'Do you like this bot?',
                    title: 'Feedback',
                    subtitle: 'Let us know!',
                    footer: 'Powered by Baileys',
                    interactiveButtons: [
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '✅ Yes',
                                id: 'text_yes'
                            })
                        },
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '❌ No',
                                id: 'text_no'
                            })
                        }
                    ]
                });

                // Example: Send an image interactive message (modern Baileys format)

                await client.sendButtons(msgFrom, {
                    imagePath: './example.jpg',
                    caption: 'here is captions of image\nwith linebreaks', // Keep it short and concise
                    title: 'Image Title', // Max 24 chars
                    subtitle: 'Image Subtitle (but optional)', // Optional, appears below title
                    footer: 'Image Footer',
                    interactiveButtons: [
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '👍 Like',
                                id: 'img_like'
                            })
                        },
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: '👎 Dislike',
                                id: 'img_dislike'
                            })
                        },

                        {
                            name: 'cta_call',
                            buttonParamsJson: JSON.stringify({
                                display_text: '📞 Call Us',
                                phone_number: '+1234567890'
                            })
                        },
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: '🌐 Visit Website',
                                url: 'https://example.com',
                                merchant_url: 'https://example.com'
                            })
                        },
                        {
                            name: 'cta_copy',
                            buttonParamsJson: JSON.stringify({
                                display_text: '🔗 Copy Link',
                                copy_code: 'https://example.com/copied'
                            })
                        }
                    ]
                });
                break

            case '!quickreplyv2':
                await client.sendQuickReplyV2(msgFrom, 'Please select an option below:', [
                    { id: 'btn-1', displayText: '✅ Accept' },
                    { id: 'btn-2', displayText: '❌ Reject' },
                    { id: 'btn-3', displayText: '📞 Contact Support' }
                ], { footer: 'Powered by Innovators Soft' });
                break

            case '!urlbuttonv2':
                await client.sendUrlButtonV2(msgFrom, 'Visit our website for more info', [
                    { displayText: '🌐 Open Website', url: 'https://example.com' }
                ], { title: 'Product Info', footer: 'Click to open' });
                break

            case '!copycodev2':
                await client.sendCopyCodeV2(msgFrom, 'Your OTP Code is:', '123456', '📋 Copy Code');
                break

            case '!combinedv2':
                await client.sendCombinedButtonsV2(msgFrom, 'Choose an action:', [
                    { type: 'reply', displayText: '🛒 Order Now', id: 'order' },
                    { type: 'url', displayText: '🌐 Website', url: 'https://example.com' },
                    { type: 'call', displayText: '📞 Phone', phoneNumber: '+923224559543' },
                    { type: 'copy', displayText: '📋 Copy Promo', copyCode: 'PROMO2024' }
                ], { title: 'Main Menu', footer: 'Innovators Soft' });
                break

            case '!listv2':
                await client.sendListV2(msgFrom, {
                    title: '📋 Product Menu',
                    buttonText: 'View Menu',
                    description: 'Please select a product',
                    footer: 'Powered by Innovators Soft',
                    sections: [
                        {
                            title: 'Food',
                            rows: [
                                { rowId: 'nasi-goreng', title: 'Fried Rice', description: '$2.50' },
                                { rowId: 'mie-goreng', title: 'Fried Noodles', description: '$2.00' }
                            ]
                        },
                        {
                            title: 'Beverages',
                            rows: [
                                { rowId: 'es-teh', title: 'Ice Tea', description: '$0.50' },
                                { rowId: 'kopi', title: 'Coffee', description: '$1.00' }
                            ]
                        }
                    ]
                });
                break

            case '!cards':
                if (fs.existsSync('./example.jpg')) {
                    const imageBuffer = fs.readFileSync('./example.jpg');
                    const videoBuffer = fs.readFileSync('./example.mp4');

                    await client.sendcards(msgFrom, {
                        text: 'Body Message',
                        title: 'Title Message',
                        subtile: 'Subtitle Message',
                        footer: 'Footer Message',
                        cards: [
                            {
                                image: imageBuffer, // use local buffer
                                title: 'Title Cards 1',
                                body: 'Body Cards 1',
                                footer: 'Footer Cards 1',
                                buttons: [
                                    {
                                        name: 'quick_reply',
                                        buttonParamsJson: JSON.stringify({
                                            display_text: 'Display Button',
                                            id: 'ID'
                                        })
                                    },
                                    {
                                        name: 'cta_url',
                                        buttonParamsJson: JSON.stringify({
                                            display_text: 'Display Button',
                                            url: 'https://www.example.com'
                                        })
                                    }
                                ]
                            },
                            {
                                video: { url: 'https://files.inqscribe.com/samples/IS_Intro.mp4' },//videoBuffer, // use same local buffer for second card
                                title: 'Title Cards 2',
                                body: 'Body Cards 2',
                                footer: 'Video URL',
                                buttons: [
                                    {
                                        name: 'quick_reply',
                                        buttonParamsJson: JSON.stringify({
                                            display_text: 'Display Button',
                                            id: 'ID2'
                                        })
                                    },
                                    {
                                        name: 'cta_url',
                                        buttonParamsJson: JSON.stringify({
                                            display_text: 'Display Button',
                                            url: 'https://www.example.com'
                                        })
                                    }
                                ]
                            },
                            {
                                video: videoBuffer, // use same local buffer for second card
                                title: 'Title Cards 3',
                                body: 'Body Cards 3',
                                footer: 'Video Buffer',
                                buttons: [
                                    {
                                        name: 'quick_reply',
                                        buttonParamsJson: JSON.stringify({
                                            display_text: 'Display Button',
                                            id: 'ID3'
                                        })
                                    },
                                    {
                                        name: 'cta_url',
                                        buttonParamsJson: JSON.stringify({
                                            display_text: 'Display Button',
                                            url: 'https://www.example.com'
                                        })
                                    }
                                ]
                            }
                        ]
                    });
                } else {
                    await client.sendMessage(msgFrom, 'Example image (example.jpg) not found for cards demonstration.');
                }
                break

            case '!call':
                try {
                    let targetJid = msgFrom;
                    if (args) {
                        targetJid = args.includes('@') ? args.trim() : `${args.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
                    }
                    console.log(`\n📞 Initiating voice call with audio streaming to ${targetJid}...`);
                    const audioPath = fs.existsSync('./audio.mp3') ? './audio.mp3' : 'silence';
                    const call = await client.initiateCall(targetJid, {
                        audioSource: audioPath, // MP3/WAV file path or "silence"
                        //durationMs: 30000          // Optional duration in ms
                    });


                    if (call) {
                        call.on('ringing', () => console.log('🔔 Call is ringing...'));
                        call.on('connected', () => console.log('🎉 Connected & streaming audio!'));
                        call.on('audio', (pcmChunk) => { /* Incoming 16 kHz Float32Array PCM */ });
                        call.on('ended', (reason) => console.log('📱 Call ended:', reason));
                        call.on('error', (err) => console.log('❌ Call error:', err));
                    }

                    await client.sendMessage(msgFrom, `📞 Voice call initiated with audio streaming (${audioPath})!`);

                } catch (error) {
                    console.error('Error initiating voice call:', error);
                    await client.sendMessage(msgFrom, `Failed to initiate call: ${error.message}`);
                }
                break

            case '!offercall':
                try {
                    if (autoCancelCallTimer) {
                        clearTimeout(autoCancelCallTimer);
                        autoCancelCallTimer = null;
                    }
                    const result = await client.offerCall(msgFrom, false);
                    lastOutgoingCallId = result?.callId || null;
                    lastOutgoingCallJid = msgFrom;

                    await client.sendMessage(msgFrom, `📞 Call offer sent! CallId: ${lastOutgoingCallId || 'unknown'}`);

                    if (lastOutgoingCallId) {
                        autoCancelCallTimer = setTimeout(async () => {
                            try {
                                await client.cancelCall(lastOutgoingCallId, lastOutgoingCallJid);
                            } catch (error) {
                                console.error('Error auto-canceling call:', error);
                            } finally {
                                lastOutgoingCallId = null;
                                lastOutgoingCallJid = null;
                                autoCancelCallTimer = null;
                            }
                        }, 10000);
                    }
                } catch (error) {
                    console.error('Error offering call:', error);
                    await client.sendMessage(msgFrom, `Failed to offer call: ${error.message}`);
                }
                break

            case '!videocall':
                try {
                    if (autoCancelCallTimer) {
                        clearTimeout(autoCancelCallTimer);
                        autoCancelCallTimer = null;
                    }
                    const result = await client.offerCall(msgFrom, true);
                    lastOutgoingCallId = result?.callId || null;
                    lastOutgoingCallJid = msgFrom;
                    await client.sendMessage(msgFrom, `📹 Video call offer sent! CallId: ${lastOutgoingCallId || 'unknown'}`);

                    if (lastOutgoingCallId) {
                        autoCancelCallTimer = setTimeout(async () => {
                            try {
                                await client.cancelCall(lastOutgoingCallId, lastOutgoingCallJid);
                            } catch (error) {
                                console.error('Error auto-canceling video call:', error);
                            } finally {
                                lastOutgoingCallId = null;
                                lastOutgoingCallJid = null;
                                autoCancelCallTimer = null;
                            }
                        }, 10000);
                    }
                } catch (error) {
                    console.error('Error offering video call:', error);
                    await client.sendMessage(msgFrom, `Failed to offer video call: ${error.message}`);
                }
                break

            case '!cancelcall':
                try {
                    if (autoCancelCallTimer) {
                        clearTimeout(autoCancelCallTimer);
                        autoCancelCallTimer = null;
                    }
                    if (!lastOutgoingCallId) {
                        await client.sendMessage(msgFrom, 'No outgoing call to cancel');
                        break;
                    }
                    await client.cancelCall(lastOutgoingCallId, msgFrom);
                    await client.sendMessage(msgFrom, `Canceled call: ${lastOutgoingCallId}`);
                    lastOutgoingCallId = null;
                    lastOutgoingCallJid = null;
                } catch (error) {
                    console.error('Error canceling call:', error);
                    await client.sendMessage(msgFrom, 'Failed to cancel call');
                }
                break

            case '!help':
                const help = `*📋 Available Commands List*\n\n` +
                    `*🔹 Basic Commands*\n` +
                    `• !ping - Check if bot is alive\n` +
                    `• !echo <text> - Echo back your text\n` +
                    `• !help - Show this command list\n\n` +

                    `*💬 Messaging*\n` +
                    `• !mention - Mention you in a message\n` +
                    `• !reply - Reply to your message\n` +
                    `• !react - React to your message with ❤️\n` +
                    `  (Note: Reactions are auto-detected!)\n` +

                    `*🖼️ Media & Content*\n` +
                    `• !media - Send an example image\n` +
                    `• !audio - Send an audio file (MP3)\n` +
                    `• !voicenote / !ptt - Send audio converted to PTT voice note (OGG)\n` +
                    `• !doc - Send an example document\n` +
                    `• !location - Send a location\n` +
                    `• !contact - Send a contact card\n` +
                    `• !sticker - Send an example sticker\n\n` +

                    `*👥 Group Management*\n` +
                    `• !groups - List all your groups\n` +
                    `• !add <number> - Add participant\n` +
                    `• !invite <number> - Send group invite link\n` +
                    `• !remove <number> - Remove participant\n` +
                    `• !promote <number> - Make admin\n` +
                    `• !demote <number> - Remove admin\n` +
                    `• !creategroup <name> - Create a new group\n` +
                    `• !groupsubject <name> - Change group name\n` +
                    `• !groupdesc <text> - Change group description\n` +
                    `• !groupsetting <setting> - Change group settings\n` +
                    `• !invitecode - Get group invite code\n` +
                    `• !revokeinvite - Revoke group invite code\n` +
                    `• !leavegroup - Leave the group\n` +
                    `• !joingroup <code> - Join group by invite code\n` +
                    `• !groupinfo [jid|code] - Full group details with participants\n` +
                    `• !joinrequests - List pending join requests\n` +
                    `• !approvejoin <number> - Approve join request\n` +
                    `• !rejectjoin <number> - Reject join request\n` +
                    `• !ephemeral <seconds> - Toggle disappearing msgs\n` +
                    `• !addmode <mode> - Change who can add members\n\n` +

                    `*🔒 Privacy*\n` +
                    `• !block <number> - Block a user\n` +
                    `• !unblock <number> - Unblock a user\n` +
                    `• !privacy - Get privacy settings\n` +
                    `• !blocklist - Get blocked contacts\n` +
                    `• !lastseenprivacy <value> - Update last seen\n` +
                    `• !onlineprivacy <value> - Update online status\n` +
                    `• !pfpprivacy <value> - Update profile pic privacy\n` +
                    `• !statusprivacy <value> - Update status privacy\n` +
                    `• !readreceiptprivacy <value> - Update read receipts\n` +
                    `• !groupaddprivacy <value> - Who can add to groups\n` +
                    `• !disappearing <seconds> - Default disappearing mode\n` +
                    `• !updatestatus <text> - Update profile status\n` +
                    `• !updatename <text> - Update profile name\n\n` +

                    `*🤖 Rich AI Messaging*\n` +
                    `• !table - Send a formatted table\n` +
                    `• !richlist - Send a bulleted list\n` +
                    `• !codeblock - Send a syntax-highlighted code snippet\n` +
                    `• !latex - Send LaTeX text\n` +
                    `• !lateximage - Send LaTeX image\n` +
                    `• !latexinlineimage - Send LaTeX inline image\n` +
                    `• !rich - Send demo rich message\n` +
                    `• !markdown - Send native markdown message\n` +
                    `• !richresponse - Send rich text with code block\n\n` +

                    `*🎛️ Templates & Buttons*\n` +
                    `• !buttons - Button template\n` +
                    `• !list - Scrollable list\n\n` +
                    `• !quickreplyv2 - Quick reply buttons V2\n` +
                    `• !urlbuttonv2 - URL button V2\n` +
                    `• !copycodev2 - Copy code button V2\n` +
                    `• !combinedv2 - Mixed buttons V2\n` +
                    `• !listv2 - Interactive list V2\n` +
                    `• !cards - Interactive cards message\n\n` +

                    `*🟢 Status*\n` +
                    `• !statustext - Post a text status\n` +
                    `• !statusimage - Post an image status\n` +
                    `• !statusvideo - Post a video status\n` +
                    `• !statusvoice - Post a voice note status\n` +
                    `• !groupstatus - Post a status directly inside a group (@g.us)\n\n` +

                    `*📞 Calls*\n` +
                    `• !call - Initiate a voice call with WebAssembly audio streaming\n` +
                    `• !offercall - Offer a voice call (signaling only)\n` +
                    `• !videocall - Offer a video call (signaling only)\n` +
                    `• !cancelcall - Cancel last outgoing call\n\n` +

                    `*� Message Store*\n` +
                    `• !messages - Get stored messages for this chat\n` +
                    `• !allmessages - Get statistics for all stored chats\n` +
                    `• !message - Get a specific message by ID\n` +
                    `• !stats - Get store capacity statistics\n\n` +

                    `*�🔐 LID/PN/JID Management*\n` +
                    `• !lid - Get your LID\n` +
                    `• !pn <lid> - Get PN from LID\n` +
                    `• !parse <jid> - Parse JID info\n` +
                    `• !normalize <phone> - Normalize to JID\n\n` +

                    `*🛡️ Protection*\n` +
                    `• Anti-Delete: Automatically active\n\n` +

                    `*⚙️ Admin Commands*\n` +
                    `• !read - Mark as read\n` +
                    `• !typing - Show typing indicator\n` +
                    `• !recording - Show recording indicator\n` +
                    `• !paused - Clear typing or recording indicator\n` +
                    `• !typing_simulate - Simulate typing for 5s then send msg\n` +
                    `• !typing_start - Start typing with auto-pause\n` +
                    `• !typing_stop - Stop typing indicator\n` +
                    `• !recording_start - Start recording indicator\n` +
                    `• !logout - End session\n\n` +

                    `*📝 Note*:\nReplace <number> with phone number\n(without + or spaces)`
                await client.sendMessage(msgFrom, help)
                break

            case '!table':
                await client.sendTable(
                    msgFrom,
                    'Price List',
                    ['Item', 'Qty', 'Price'],
                    [
                        ['Apple', '3', '$1.50'],
                        ['Banana', '6', '$0.90'],
                        ['Cherry', '1', '$3.00']
                    ],
                    msg.raw,
                    { headerText: 'Here is your order summary:', footer: 'Thank you!' }
                );
                break;

            case '!richlist':
                await client.sendRichList(
                    msgFrom,
                    'Available Commands',
                    ['!help', '!ping', '!menu', '!info'],
                    msg.raw,
                    { headerText: 'Bot commands:', footer: 'Type any command to use it.' }
                );
                break;

            case '!codeblock':
                await client.sendCodeBlock(
                    msgFrom,
                    `async function fetchData(url) {\n  const res = await fetch(url)\n  return res.json()\n}`,
                    msg.raw,
                    { title: '📦 Example – fetch helper', language: 'javascript', footer: 'Copy and paste into your project.' }
                );
                break;

            case '!latex':
                await client.sendLatex(
                    msgFrom,
                    { text: 'Quadratic formula:', expressions: [{ latexExpression: 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}' }] }
                );
                break;

            case '!lateximage':
                try {
                    await client.sendLatexImage(
                        msgFrom,
                        {
                            formula: 'E=mc^2',
                            caption: 'Mass-Energy Equivalence (DPI 600)'
                        }
                    );
                } catch (error) {
                    return (error)
                }
                break;

            case '!latexinlineimage':
                try {
                    await client.sendLatexInlineImage(
                        msgFrom,
                        {
                            expressions: [
                                { latexExpression: 'e^{i\\pi} + 1 = 0' },
                                { latexExpression: '\\int_a^b x^2 \\, dx = \\frac{b^3 - a^3}{3}' },
                                { latexExpression: 'f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!} (x-a)^n' }
                            ],
                            caption: true // Use each LaTeX expression as the caption for its respective image in the album
                        }
                    );
                } catch (error) {
                    return (error)
                }
                break;

            case '!rich':
                const richLatexExpr = 'E = mc^2';
                const richPngBuf = await renderLatexToPng(richLatexExpr);
                const richImageUrl = (await uploadUnencryptedToWA(richPngBuf.buffer, client.sock.waUploadToServer)).url;

                await client.sendRichMessage(msgFrom, [
                    {
                        messageType: RichSubMessageType.TEXT,
                        messageText: '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n\n___\n\n> To use a horizontal line, you need to have two "\\n" above and below the "___"\n==Highlighted text==\n# By the way, ^you^ can _mix_ ==multiple markdowns== for a **richer response**\n###### Try different combinations...'
                    },
                    {
                        messageType: RichSubMessageType.TABLE,
                        tableMetadata: {
                            title: 'Product Prices',
                            rows: [
                                { items: ['Product', 'Price', 'Stock'], isHeading: true },
                                { items: ['Innovators Baileys Pro', '$49.99', 'In Stock'] },
                                { items: ['Rust WASM Plugin', '$19.99', 'Low Stock'] }
                            ]
                        }
                    },
                    {
                        messageType: RichSubMessageType.TEXT,
                        messageText: 'LaTeX Formula:'
                    },
                    {
                        messageType: RichSubMessageType.INLINE_IMAGE,
                        imageMetadata: {
                            imageUrl: {
                                imagePreviewUrl: richImageUrl,
                                imageHighResUrl: richImageUrl
                            },
                            imageText: richLatexExpr,
                            alignment: 2
                        }
                    },
                    {
                        messageType: RichSubMessageType.CODE,
                        codeMetadata: {
                            codeLanguage: 'javascript',
                            codeBlocks: [
                                { highlightType: 1, codeContent: 'const ' },
                                { highlightType: 0, codeContent: 'price = ' },
                                { highlightType: 4, codeContent: '49.99' },
                                { highlightType: 0, codeContent: ';\n' },
                                { highlightType: 1, codeContent: 'if ' },
                                { highlightType: 0, codeContent: '(price > ' },
                                { highlightType: 4, codeContent: '20' },
                                { highlightType: 0, codeContent: ') {\n    console.log(' },
                                { highlightType: 3, codeContent: '"Premium tier"' },
                                { highlightType: 0, codeContent: ');\n}' }
                            ]
                        }
                    }
                ], null, { useMarkdown: true });
                break;

            case '!markdown':
                await client.sendMarkdown(
                    msgFrom,
                    '# Markdown Demo\n## Headers work\n==Highlighted text==\n_Italics_ and **Bold** are supported!',
                    msg.raw
                );
                break;

            case '!richresponse':
                // Demonstrate that sendMessage can now natively accept an array of rich submessages
                await client.sendMessage(msgFrom, {
                    richResponse: [
                        {
                            messageType: 2,
                            messageText: '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n\n___\n\n> To use a horizontal line, you need to have two "\\n" above and below the "___"\n==Highlighted text==\n# By the way, ^you^ can _mix_ ==multiple markdowns== for a **richer response**\n###### Try different combinations...'
                        },
                        {
                            messageType: 2,
                            messageText: 'And here is a syntax-highlighted code block natively passed:'
                        },
                        {
                            messageType: 5,
                            codeMetadata: {
                                codeLanguage: 'javascript',
                                codeBlocks: [
                                    { highlightType: 1, codeContent: 'const ' },
                                    { highlightType: 0, codeContent: 'greet = (name) => {\n  console.log(' },
                                    { highlightType: 3, codeContent: '"Hello, "' },
                                    { highlightType: 0, codeContent: ' + name)\n}\n' },
                                    { highlightType: 0, codeContent: 'greet(' },
                                    { highlightType: 3, codeContent: '"World"' },
                                    { highlightType: 0, codeContent: ')' }
                                ]
                            }
                        }
                    ]
                },
                    { markdown: true });
                break;

            case '!groups':
                try {
                    const groups = await client.getAllGroups()
                    if (groups && groups.length > 0) {
                        let groupList = '*Your Groups:*\n\n'
                        groups.forEach((group, index) => {
                            groupList += `${index + 1}. *${group.subject}*\n`
                            groupList += `   ID: ${group.id}\n`
                            if (group.notify) groupList += `   Notify: ${group.notify}\n`
                            groupList += `   Members: ${group.participants.length}\n`
                            if (group.desc) groupList += `   Description: ${group.desc}\n`
                            groupList += '\n'
                        })
                        await client.sendMessage(msgFrom, groupList)
                    } else {
                        await client.sendMessage(msgFrom, 'You are not in any groups')
                    }
                } catch (error) {
                    console.error('Error fetching groups:', error)
                    await client.sendMessage(msgFrom, 'Failed to fetch groups')
                }
                break

            case '!groupinfo':
                try {
                    // Use provided group JID or current group
                    const groupJid = args.trim() || msg.raw.key.remoteJid
                    if (!groupJid || !groupJid.endsWith('@g.us')) {
                        await client.sendMessage(msgFrom, '❌ Please provide a group JID or use this command in a group.\nUsage: !groupinfo <groupJid>')
                        break
                    }
                    const groupInfo = await client.getGroupMetadata(groupJid)
                    if (groupInfo) {
                        let groupList = `*Group Info:*\n\n` +
                            `ID: ${groupInfo.id}\n` +
                            `Notify: ${groupInfo.notify || 'N/A'}\n` +
                            `Subject: ${groupInfo.subject}\n` +
                            `Owner: ${groupInfo.owner || 'N/A'}\n` +
                            `Created: ${new Date(groupInfo.creation * 1000).toLocaleString()}\n` +
                            `Members: ${groupInfo.participants.length}\n` +
                            `Description: ${groupInfo.desc || 'N/A'}\n\n` +
                            `*👥 Participants:*\n\n`

                        groupInfo.participants.forEach((p, i) => {
                            const role = p.admin === 'superadmin' ? '👑 Super Admin'
                                : p.admin === 'admin' ? '🛡️ Admin'
                                    : '👤 Member'
                            groupList += `${i + 1}. ${p.id}\n`
                            groupList += `   Role: ${role}\n`
                            if (p.notify) groupList += `   Name: ${p.notify}\n`
                            groupList += '\n'
                        })

                        await client.sendMessage(msgFrom, groupList)
                    } else {
                        await client.sendMessage(msgFrom, 'Group not found')
                    }
                } catch (error) {
                    console.error('Error fetching group info:', error)
                    await client.sendMessage(msgFrom, 'Failed to fetch group info')
                }
                break
            case '!logout':
                // Ask for confirmation before logging out
                await client.sendButtons(msgFrom, {
                    text: 'Are you sure you want to logout?',
                    title: 'Logout Confirmation',
                    footer: 'Choose Yes to logout or No to cancel',
                    interactiveButtons: [
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: 'Yes',
                                id: 'logout_yes'
                            })
                        },
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: 'No',
                                id: 'logout_no'
                            })
                        }
                    ]
                });
                break;
            // Handle logout confirmation
            case 'Yes':
            case 'yes':
            case 'logout_yes':

                await client.sendMessage(msgFrom, 'You have been logged out.');
                await client.logout();
                break;
            case 'No':
            case 'no':
            case 'logout_no':
                await client.sendMessage(msgFrom, 'Logout cancelled.');
                break;
            case '!lid':
                // Get LID for the user's phone number
                try {
                    const lid = await client.getLIDForPN(msgFrom);
                    if (lid) {
                        await client.sendMessage(msgFrom, `Your LID: ${lid}\nYour PN: ${msgFrom}`);
                    } else {
                        await client.sendMessage(msgFrom, `No LID found for ${msgFrom}. You might be using a PN-only session.`);
                    }
                } catch (error) {
                    console.error('Error getting LID:', error);
                    await client.sendMessage(msgFrom, 'Failed to get LID.');
                }
                break;

            case '!pn':
                // Get PN from LID
                try {
                    const lidToCheck = args.trim();
                    if (!lidToCheck) {
                        await client.sendMessage(msgFrom, 'Please provide a LID. Example: !pn 123456@lid');
                        break;
                    }
                    const pn = await client.getPNForLID(lidToCheck);
                    if (pn) {
                        await client.sendMessage(msgFrom, `Phone Number for ${lidToCheck}: ${pn}`);
                    } else {
                        await client.sendMessage(msgFrom, `No phone number found for LID: ${lidToCheck}`);
                    }
                } catch (error) {
                    console.error('Error getting PN from LID:', error);
                    await client.sendMessage(msgFrom, 'Failed to get phone number.');
                }
                break;
            case '!ad':
                await client.sendAdReply(
                    msgFrom,
                    'Ad Message',
                    './example.jpg',
                    'Ad Title',
                    'Ad Body',
                    'https://m.facebook.com/innovatorssoft'
                )
                break;

            case '!sticker':
                if (fs.existsSync('./example.jpg')) {
                    const path = './example.jpg';
                    const imageBuffer = fs.readFileSync(path);
                    await client.sendSticker(msgFrom, imageBuffer, { packName: 'Innovators', author: 'Innovators Soft' });
                } else {
                    await client.sendMessage(msgFrom, 'Example image (jpg) not found')
                }
                break;

            case '!parse':
                if (args) {
                    const info = client.parseJid(args);
                    await client.sendMessage(msgFrom, `*JID Info:*\n\nUser: ${info.user}\nServer: ${info.server}\nIs LID: ${info.isLid}`);
                } else {
                    await client.sendMessage(msgFrom, 'Please provide a JID to parse');
                }
                break;

            case '!normalize':
                if (args) {
                    const jid = client.normalizePhoneToJid(args);
                    await client.sendMessage(msgFrom, `*Normalized JID:* ${jid}`);
                } else {
                    await client.sendMessage(msgFrom, 'Please provide a phone number');
                }
                break;

            case '!typing':
                await client.sendStateTyping(msgFrom);
                await client.sendMessage(msgFrom, 'Typing indicator sent!');
                break;

            case '!recording':
                await client.sendStateRecording(msgFrom);
                await client.sendMessage(msgFrom, 'Recording indicator sent!');
                break;

            case '!paused':
                await client.clearState(msgFrom);
                await client.sendMessage(msgFrom, 'Stopped typing/recording indicator sent!');
                break;

            case '!typing_simulate':
                // Show "typing..." for 5 seconds, then send the message — all in one call
                await client.sendMessage(msgFrom, 'Simulating typing for 5 seconds...');
                const typing = client.createPresenceController();
                await typing.simulateTyping(msgFrom, 5000, async () => {
                    await client.sendMessage(msgFrom, 'This message was sent after 5 seconds of typing! ✅');
                });
                break;

            case '!typing_start':
                // Manual start (auto-pauses after 5 s by default if not specified)
                const typingStart = client.createPresenceController();
                await typingStart.startTyping(msgFrom, { duration: 10000 }); // Show for 10s
                await client.sendMessage(msgFrom, 'Typing indicator started for 10 seconds.');
                break;

            case '!typing_stop':
                const typingStop = client.createPresenceController();
                await typingStop.stopTyping(msgFrom);
                await client.sendMessage(msgFrom, 'Typing indicator stopped.');
                break;

            case '!recording_start':
                const recordingIndicator = client.createPresenceController();
                await recordingIndicator.startRecording(msgFrom, { duration: 5000 });
                await client.sendMessage(msgFrom, 'Recording indicator started for 5 seconds.');
                break;

            case '!typing_stop_all':
                const typingStopAll = client.createPresenceController();
                await typingStopAll.stopAll();
                await client.sendMessage(msgFrom, 'All active indicators for this controller stopped.');
                break;

            case '!read':
                await client.readMessage(msg.raw.key);
                await client.sendMessage(msgFrom, 'Message marked as read!');
                break;

            case '!add':
            case '!remove':
            case '!promote':
            case '!demote':
                try {
                    if (!msg.raw.key.remoteJid.endsWith('@g.us')) {
                        await client.sendMessage(msgFrom, 'This command can only be used in groups')
                        break
                    }

                    const rawNumber = args.replace(/[^0-9]/g, '')

                    // Validate phone number format
                    if (!rawNumber || rawNumber.length < 10) {
                        await client.sendMessage(msgFrom,
                            `❌ Invalid phone number format.\n\n` +
                            `✅ Correct format: !${command.slice(1)} 923001234567\n` +
                            `(Include country code without + or spaces)`
                        )
                        break
                    }

                    // Ensure country code is present (check if starts with common codes)
                    if (rawNumber.startsWith('0')) {
                        await client.sendMessage(msgFrom,
                            `❌ Phone number must include country code.\n\n` +
                            `Example:\n` +
                            `• Pakistan: 923001234567 (not 03001234567)\n` +
                            `• India: 919876543210 (not 09876543210)\n` +
                            `• USA: 14155551234 (not 4155551234)`
                        )
                        break
                    }

                    const number = rawNumber + '@s.whatsapp.net'

                    let action
                    switch (command) {
                        case '!add': action = 'add'; break
                        case '!remove': action = 'remove'; break
                        case '!promote': action = 'promote'; break
                        case '!demote': action = 'demote'; break
                    }

                    const result = await client.changeGroupParticipants(msg.raw.key.remoteJid, [number], action)
                    const actionMap = {
                        add: 'added to',
                        remove: 'removed from',
                        promote: 'promoted in',
                        demote: 'demoted in'
                    }

                    if (result[0].status == 200) {
                        await client.sendMessage(msgFrom, `Successfully ${actionMap[action]} the group`)
                    } else if (result[0].status == 403 && result[0].invitationSent) {
                        await client.sendMessage(msgFrom, `⚠️ Could not add directly due to privacy settings.\n✅ Group invitation link has been sent to the user instead!`)
                    } else {
                        await client.sendMessage(msgFrom, `Failed to ${action} participant: ${result[0].message || result[0].content || result[0].error || 'Unknown error'}`)
                    }
                } catch (error) {
                    console.error(`Error ${command} participant:`, error)
                    if (error.output?.statusCode === 408) {
                        await client.sendMessage(msgFrom, `⏱️ Request timed out. The number might be invalid or not on WhatsApp.`)
                    } else {
                        await client.sendMessage(msgFrom, `Failed to ${command.slice(1)} participant: ${error.message || 'Unknown error'}`)
                    }
                }
                break


            case '!invite':
                try {
                    if (!msg.raw.key.remoteJid.endsWith('@g.us')) {
                        await client.sendMessage(msgFrom, 'This command can only be used in groups')
                        break
                    }

                    const rawInviteNumber = args.replace(/[^0-9]/g, '')

                    // Validate phone number format
                    if (!rawInviteNumber || rawInviteNumber.length < 10) {
                        await client.sendMessage(msgFrom,
                            `❌ Invalid phone number format.\n\n` +
                            `✅ Correct format: !invite 923001234567\n` +
                            `(Include country code without + or spaces)`
                        )
                        break
                    }

                    // Ensure country code is present
                    if (rawInviteNumber.startsWith('0')) {
                        await client.sendMessage(msgFrom,
                            `❌ Phone number must include country code.\n\n` +
                            `Example:\n` +
                            `• Pakistan: 923001234567 (not 03001234567)\n` +
                            `• India: 919876543210 (not 09876543210)\n` +
                            `• USA: 14155551234 (not 4155551234)`
                        )
                        break
                    }

                    const inviteNumber = rawInviteNumber + '@s.whatsapp.net'

                    await client.sendGroupInvitation(msg.raw.key.remoteJid, inviteNumber)
                    await client.sendMessage(msgFrom, `✅ Group invitation sent to ${rawInviteNumber}`)
                } catch (error) {
                    console.error('Error sending invitation:', error)
                    if (error.output?.statusCode === 408) {
                        await client.sendMessage(msgFrom, `⏱️ Request timed out. The number might be invalid or not on WhatsApp.`)
                    } else {
                        await client.sendMessage(msgFrom, `Failed to send group invitation: ${error.message || 'Unknown error'}`)
                    }
                }
                break

            // ═══════════════════════════════════════════════════
            // 📁 GROUP MANAGEMENT COMMANDS
            // ═══════════════════════════════════════════════════

            case '!creategroup':
                try {
                    if (!args) {
                        await client.sendMessage(msgFrom, '❌ Please provide a group name.\nUsage: !creategroup My New Group');
                        break;
                    }
                    const newGroup = await client.createGroup(args, [msgFrom]);
                    await client.sendMessage(msgFrom, `✅ Group created!\n\nName: *${args}*\nID: ${newGroup.id || newGroup.gid}`);
                } catch (error) {
                    console.error('Error creating group:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to create group: ${error.message}`);
                }
                break;

            case '!groupsubject':
                try {
                    if (!msg.raw.key.remoteJid.endsWith('@g.us')) {
                        await client.sendMessage(msgFrom, '❌ This command can only be used in groups');
                        break;
                    }
                    if (!args) {
                        await client.sendMessage(msgFrom, '❌ Please provide a new group name.\nUsage: !groupsubject New Name');
                        break;
                    }
                    await client.changeGroupSubject(msg.raw.key.remoteJid, args);
                    await client.sendMessage(msgFrom, `✅ Group name changed to: *${args}*`);
                } catch (error) {
                    console.error('Error changing group subject:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to change group name: ${error.message}`);
                }
                break;

            case '!groupdesc':
                try {
                    if (!msg.raw.key.remoteJid.endsWith('@g.us')) {
                        await client.sendMessage(msgFrom, '❌ This command can only be used in groups');
                        break;
                    }
                    if (!args) {
                        await client.sendMessage(msgFrom, '❌ Please provide a new description.\nUsage: !groupdesc New description here');
                        break;
                    }
                    await client.changeGroupDescription(msg.raw.key.remoteJid, args);
                    await client.sendMessage(msgFrom, `✅ Group description updated!`);
                } catch (error) {
                    console.error('Error changing group description:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to change description: ${error.message}`);
                }
                break;

            case '!groupsetting':
                try {
                    if (!msg.raw.key.remoteJid.endsWith('@g.us')) {
                        await client.sendMessage(msgFrom, '❌ This command can only be used in groups');
                        break;
                    }
                    if (!args || !['announcement', 'not_announcement', 'locked', 'unlocked'].includes(args.trim())) {
                        await client.sendMessage(msgFrom,
                            `❌ Invalid setting.\n\n` +
                            `Usage: !groupsetting <setting>\n\n` +
                            `Available settings:\n` +
                            `• announcement - Only admins can send messages\n` +
                            `• not_announcement - Everyone can send messages\n` +
                            `• locked - Only admins can edit group info\n` +
                            `• unlocked - Everyone can edit group info`
                        );
                        break;
                    }
                    await client.changeGroupSettings(msg.raw.key.remoteJid, args.trim());
                    await client.sendMessage(msgFrom, `✅ Group setting changed to: *${args.trim()}*`);
                } catch (error) {
                    console.error('Error changing group settings:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to change setting: ${error.message}`);
                }
                break;

            case '!invitecode':
                try {
                    if (!msg.raw.key.remoteJid.endsWith('@g.us')) {
                        await client.sendMessage(msgFrom, '❌ This command can only be used in groups');
                        break;
                    }
                    const inviteCode = await client.getGroupInviteCode(msg.raw.key.remoteJid);
                    await client.sendMessage(msgFrom, `✅ Group Invite Link:\nhttps://chat.whatsapp.com/${inviteCode}`);
                } catch (error) {
                    console.error('Error getting invite code:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to get invite code: ${error.message}`);
                }
                break;

            case '!revokeinvite':
                try {
                    if (!msg.raw.key.remoteJid.endsWith('@g.us')) {
                        await client.sendMessage(msgFrom, '❌ This command can only be used in groups');
                        break;
                    }
                    const newInviteCode = await client.revokeGroupInviteCode(msg.raw.key.remoteJid);
                    await client.sendMessage(msgFrom, `✅ Invite code revoked!\nNew invite link:\nhttps://chat.whatsapp.com/${newInviteCode}`);
                } catch (error) {
                    console.error('Error revoking invite code:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to revoke invite code: ${error.message}`);
                }
                break;

            case '!leavegroup':
                try {
                    if (!msg.raw.key.remoteJid.endsWith('@g.us')) {
                        await client.sendMessage(msgFrom, '❌ This command can only be used in groups');
                        break;
                    }
                    await client.sendMessage(msgFrom, '👋 Leaving group...');
                    await client.leaveGroup(msg.raw.key.remoteJid);
                } catch (error) {
                    console.error('Error leaving group:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to leave group: ${error.message}`);
                }
                break;

            case '!joingroup':
                try {
                    if (!args) {
                        await client.sendMessage(msgFrom, '❌ Please provide an invite code.\nUsage: !joingroup AbCdEfGhIjK\n(or full link: !joingroup https://chat.whatsapp.com/AbCdEfGhIjK)');
                        break;
                    }
                    const joinedGroupId = await client.joinGroupByInviteCode(args.trim());
                    await client.sendMessage(msgFrom, `✅ Successfully joined group!\nGroup ID: ${joinedGroupId}`);
                } catch (error) {
                    console.error('Error joining group:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to join group: ${error.message}`);
                }
                break;

            case '!groupinfo':
                try {
                    const input = args.trim()
                    let groupInfoResult

                    if (!input) {
                        // No args: use current group
                        if (!msg.raw.key.remoteJid.endsWith('@g.us')) {
                            await client.sendMessage(msgFrom, '❌ Use this command in a group, or provide a group JID / invite code.\nUsage:\n• !groupinfo (in a group)\n• !groupinfo 120363xxxxx@g.us\n• !groupinfo AbCdEfGhIjK')
                            break
                        }
                        groupInfoResult = await client.getGroupMetadata(msg.raw.key.remoteJid)
                    } else if (input.includes('@g.us')) {
                        // Argument is a group JID
                        groupInfoResult = await client.getGroupMetadata(input)
                    } else {
                        // Argument is an invite code (or full link)
                        groupInfoResult = await client.getGroupInfoByInviteCode(input)
                    }

                    if (!groupInfoResult) {
                        await client.sendMessage(msgFrom, '❌ Group not found.')
                        break
                    }

                    // Build group info header
                    let infoText = `*📋 Group Info*\n\n`
                    infoText += `*Name:* ${groupInfoResult.subject || 'N/A'}\n`
                    infoText += `*ID:* ${groupInfoResult.id || 'N/A'}\n`
                    if (groupInfoResult.notify) infoText += `*Notify:* ${groupInfoResult.notify}\n`
                    infoText += `*Owner:* ${groupInfoResult.owner || 'N/A'}\n`
                    infoText += `*Created:* ${groupInfoResult.creation ? new Date(groupInfoResult.creation * 1000).toLocaleString() : 'N/A'}\n`
                    infoText += `*Size:* ${groupInfoResult.size || groupInfoResult.participants?.length || 'N/A'}\n`
                    infoText += `*Description:* ${groupInfoResult.desc || 'No description'}\n`
                    if (groupInfoResult.announce !== undefined) infoText += `*Announce:* ${groupInfoResult.announce ? 'Yes (admins only)' : 'No'}\n`
                    if (groupInfoResult.restrict !== undefined) infoText += `*Restricted:* ${groupInfoResult.restrict ? 'Yes (admins only edit info)' : 'No'}\n`
                    if (groupInfoResult.ephemeralDuration) infoText += `*Disappearing:* ${groupInfoResult.ephemeralDuration}s\n`
                    if (groupInfoResult.memberAddMode !== undefined) infoText += `*Member Add:* ${groupInfoResult.memberAddMode ? 'All members' : 'Admins only'}\n`
                    if (groupInfoResult.isCommunity) infoText += `*Community:* Yes\n`
                    if (groupInfoResult.linkedParent) infoText += `*Linked Parent:* ${groupInfoResult.linkedParent}\n`

                    // Build participants list if available
                    if (groupInfoResult.participants && groupInfoResult.participants.length > 0) {
                        infoText += `\n*👥 Participants (${groupInfoResult.participants.length}):*\n\n`
                        groupInfoResult.participants.forEach((p, i) => {
                            const role = p.admin === 'superadmin' ? '👑 Super Admin'
                                : p.admin === 'admin' ? '🛡️ Admin'
                                    : '👤 Member'
                            infoText += `${i + 1}. ${p.id}\n`
                            infoText += `   Role: ${role}\n`
                            if (p.notify) infoText += `   Name: ${p.notify}\n`
                            if (p.lid) infoText += `   LID: ${p.lid}\n`
                            if (p.phoneNumber) infoText += `   Phone: ${p.phoneNumber}\n`
                            infoText += '\n'
                        })
                    }

                    await client.sendMessage(msgFrom, infoText)
                } catch (error) {
                    console.error('Error getting group info:', error)
                    await client.sendMessage(msgFrom, `❌ Failed to get group info: ${error.message}`)
                }
                break;

            case '!joinrequests':
                try {
                    if (!msg.raw.key.remoteJid.endsWith('@g.us')) {
                        await client.sendMessage(msgFrom, '❌ This command can only be used in groups');
                        break;
                    }
                    const requests = await client.getGroupJoinRequests(msg.raw.key.remoteJid);
                    if (requests && requests.length > 0) {
                        let requestList = `*📋 Pending Join Requests (${requests.length}):*\n\n`;
                        requests.forEach((req, i) => {
                            requestList += `${i + 1}. ${req.jid}\n`;
                            if (req.request_time) requestList += `   Requested: ${new Date(req.request_time * 1000).toLocaleString()}\n`;
                        });
                        requestList += `\nUse !approvejoin or !rejectjoin <number> to respond`;
                        await client.sendMessage(msgFrom, requestList);
                    } else {
                        await client.sendMessage(msgFrom, '✅ No pending join requests.');
                    }
                } catch (error) {
                    console.error('Error getting join requests:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to get join requests: ${error.message}`);
                }
                break;

            case '!approvejoin':
                try {
                    if (!msg.raw.key.remoteJid.endsWith('@g.us')) {
                        await client.sendMessage(msgFrom, '❌ This command can only be used in groups');
                        break;
                    }
                    const approveNum = args?.replace(/[^0-9]/g, '');
                    if (!approveNum || approveNum.length < 10) {
                        await client.sendMessage(msgFrom, '❌ Please provide a valid phone number.\nUsage: !approvejoin 923001234567');
                        break;
                    }
                    const approveResult = await client.handleGroupJoinRequest(msg.raw.key.remoteJid, [approveNum + '@s.whatsapp.net'], 'approve');
                    await client.sendMessage(msgFrom, `✅ Join request approved for ${approveNum}`);
                } catch (error) {
                    console.error('Error approving join request:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to approve: ${error.message}`);
                }
                break;

            case '!rejectjoin':
                try {
                    if (!msg.raw.key.remoteJid.endsWith('@g.us')) {
                        await client.sendMessage(msgFrom, '❌ This command can only be used in groups');
                        break;
                    }
                    const rejectNum = args?.replace(/[^0-9]/g, '');
                    if (!rejectNum || rejectNum.length < 10) {
                        await client.sendMessage(msgFrom, '❌ Please provide a valid phone number.\nUsage: !rejectjoin 923001234567');
                        break;
                    }
                    const rejectResult = await client.handleGroupJoinRequest(msg.raw.key.remoteJid, [rejectNum + '@s.whatsapp.net'], 'reject');
                    await client.sendMessage(msgFrom, `✅ Join request rejected for ${rejectNum}`);
                } catch (error) {
                    console.error('Error rejecting join request:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to reject: ${error.message}`);
                }
                break;

            case '!ephemeral':
                try {
                    if (!msg.raw.key.remoteJid.endsWith('@g.us')) {
                        await client.sendMessage(msgFrom, '❌ This command can only be used in groups');
                        break;
                    }
                    const ephemeralSeconds = parseInt(args);
                    if (isNaN(ephemeralSeconds)) {
                        await client.sendMessage(msgFrom,
                            `❌ Please provide duration in seconds.\n\n` +
                            `Usage: !ephemeral <seconds>\n\n` +
                            `Options:\n` +
                            `• 0 - Turn off\n` +
                            `• 86400 - 24 hours\n` +
                            `• 604800 - 7 days\n` +
                            `• 7776000 - 90 days`
                        );
                        break;
                    }
                    await client.toggleGroupEphemeral(msg.raw.key.remoteJid, ephemeralSeconds);
                    const durationText = ephemeralSeconds === 0 ? 'OFF' : `${ephemeralSeconds} seconds`;
                    await client.sendMessage(msgFrom, `✅ Disappearing messages set to: *${durationText}*`);
                } catch (error) {
                    console.error('Error toggling ephemeral:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to toggle disappearing messages: ${error.message}`);
                }
                break;

            case '!addmode':
                try {
                    if (!msg.raw.key.remoteJid.endsWith('@g.us')) {
                        await client.sendMessage(msgFrom, '❌ This command can only be used in groups');
                        break;
                    }
                    if (!args || !['all_member_add', 'admin_add'].includes(args.trim())) {
                        await client.sendMessage(msgFrom,
                            `❌ Invalid mode.\n\n` +
                            `Usage: !addmode <mode>\n\n` +
                            `Options:\n` +
                            `• all_member_add - All members can add\n` +
                            `• admin_add - Only admins can add`
                        );
                        break;
                    }
                    await client.changeGroupAddMode(msg.raw.key.remoteJid, args.trim());
                    await client.sendMessage(msgFrom, `✅ Group add mode changed to: *${args.trim()}*`);
                } catch (error) {
                    console.error('Error changing add mode:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to change add mode: ${error.message}`);
                }
                break;

            // ═══════════════════════════════════════════════════
            // 🔒 PRIVACY COMMANDS
            // ═══════════════════════════════════════════════════

            case '!block':
                try {
                    const blockNum = args?.replace(/[^0-9]/g, '');
                    if (!blockNum || blockNum.length < 10) {
                        await client.sendMessage(msgFrom, '❌ Please provide a valid phone number.\nUsage: !block 923001234567');
                        break;
                    }
                    await client.blockUser(blockNum + '@s.whatsapp.net');
                    await client.sendMessage(msgFrom, `✅ User ${blockNum} has been blocked.`);
                } catch (error) {
                    console.error('Error blocking user:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to block user: ${error.message}`);
                }
                break;

            case '!unblock':
                try {
                    const unblockNum = args?.replace(/[^0-9]/g, '');
                    if (!unblockNum || unblockNum.length < 10) {
                        await client.sendMessage(msgFrom, '❌ Please provide a valid phone number.\nUsage: !unblock 923001234567');
                        break;
                    }
                    await client.unblockUser(unblockNum + '@s.whatsapp.net');
                    await client.sendMessage(msgFrom, `✅ User ${unblockNum} has been unblocked.`);
                } catch (error) {
                    console.error('Error unblocking user:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to unblock user: ${error.message}`);
                }
                break;

            case '!privacy':
                try {
                    const privacySettings = await client.getPrivacySettings();
                    let privacyText = `*🔒 Privacy Settings*\n\n`;
                    for (const [key, value] of Object.entries(privacySettings)) {
                        privacyText += `• ${key}: *${value}*\n`;
                    }
                    await client.sendMessage(msgFrom, privacyText);
                } catch (error) {
                    console.error('Error fetching privacy settings:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to get privacy settings: ${error.message}`);
                }
                break;

            case '!blocklist':
                try {
                    const blockedList = await client.getBlockList();
                    if (blockedList && blockedList.length > 0) {
                        let blockText = `*🚫 Blocked Contacts (${blockedList.length}):*\n\n`;
                        blockedList.forEach((jid, i) => {
                            blockText += `${i + 1}. ${jid}\n`;
                        });
                        await client.sendMessage(msgFrom, blockText);
                    } else {
                        await client.sendMessage(msgFrom, '✅ No blocked contacts.');
                    }
                } catch (error) {
                    console.error('Error fetching block list:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to get block list: ${error.message}`);
                }
                break;

            case '!lastseenprivacy':
                try {
                    const lsValues = ['all', 'contacts', 'contact_blacklist', 'none'];
                    if (!args || !lsValues.includes(args.trim())) {
                        await client.sendMessage(msgFrom,
                            `❌ Invalid value.\n\nUsage: !lastseenprivacy <value>\n\nOptions: ${lsValues.join(', ')}`
                        );
                        break;
                    }
                    await client.updateLastSeenPrivacy(args.trim());
                    await client.sendMessage(msgFrom, `✅ Last seen privacy updated to: *${args.trim()}*`);
                } catch (error) {
                    console.error('Error updating last seen privacy:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to update: ${error.message}`);
                }
                break;

            case '!onlineprivacy':
                try {
                    const onValues = ['all', 'match_last_seen'];
                    if (!args || !onValues.includes(args.trim())) {
                        await client.sendMessage(msgFrom,
                            `❌ Invalid value.\n\nUsage: !onlineprivacy <value>\n\nOptions: ${onValues.join(', ')}`
                        );
                        break;
                    }
                    await client.updateOnlinePrivacy(args.trim());
                    await client.sendMessage(msgFrom, `✅ Online privacy updated to: *${args.trim()}*`);
                } catch (error) {
                    console.error('Error updating online privacy:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to update: ${error.message}`);
                }
                break;

            case '!pfpprivacy':
                try {
                    const pfpValues = ['all', 'contacts', 'contact_blacklist', 'none'];
                    if (!args || !pfpValues.includes(args.trim())) {
                        await client.sendMessage(msgFrom,
                            `❌ Invalid value.\n\nUsage: !pfpprivacy <value>\n\nOptions: ${pfpValues.join(', ')}`
                        );
                        break;
                    }
                    await client.updateProfilePicturePrivacy(args.trim());
                    await client.sendMessage(msgFrom, `✅ Profile picture privacy updated to: *${args.trim()}*`);
                } catch (error) {
                    console.error('Error updating profile picture privacy:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to update: ${error.message}`);
                }
                break;

            case '!statusprivacy':
                try {
                    const stValues = ['all', 'contacts', 'contact_blacklist', 'none'];
                    if (!args || !stValues.includes(args.trim())) {
                        await client.sendMessage(msgFrom,
                            `❌ Invalid value.\n\nUsage: !statusprivacy <value>\n\nOptions: ${stValues.join(', ')}`
                        );
                        break;
                    }
                    await client.updateStatusPrivacy(args.trim());
                    await client.sendMessage(msgFrom, `✅ Status privacy updated to: *${args.trim()}*`);
                } catch (error) {
                    console.error('Error updating status privacy:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to update: ${error.message}`);
                }
                break;

            case '!readreceiptprivacy':
                try {
                    const rrValues = ['all', 'none'];
                    if (!args || !rrValues.includes(args.trim())) {
                        await client.sendMessage(msgFrom,
                            `❌ Invalid value.\n\nUsage: !readreceiptprivacy <value>\n\nOptions: ${rrValues.join(', ')}`
                        );
                        break;
                    }
                    await client.updateReadReceiptsPrivacy(args.trim());
                    await client.sendMessage(msgFrom, `✅ Read receipts privacy updated to: *${args.trim()}*`);
                } catch (error) {
                    console.error('Error updating read receipts privacy:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to update: ${error.message}`);
                }
                break;

            case '!groupaddprivacy':
                try {
                    const gaValues = ['all', 'contacts', 'contact_blacklist'];
                    if (!args || !gaValues.includes(args.trim())) {
                        await client.sendMessage(msgFrom,
                            `❌ Invalid value.\n\nUsage: !groupaddprivacy <value>\n\nOptions: ${gaValues.join(', ')}`
                        );
                        break;
                    }
                    await client.updateGroupsAddPrivacy(args.trim());
                    await client.sendMessage(msgFrom, `✅ Groups add privacy updated to: *${args.trim()}*`);
                } catch (error) {
                    console.error('Error updating groups add privacy:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to update: ${error.message}`);
                }
                break;

            case '!disappearing':
                try {
                    const disappearingSeconds = parseInt(args);
                    if (isNaN(disappearingSeconds)) {
                        await client.sendMessage(msgFrom,
                            `❌ Please provide duration in seconds.\n\n` +
                            `Usage: !disappearing <seconds>\n\n` +
                            `Options:\n` +
                            `• 0 - Turn off\n` +
                            `• 86400 - 24 hours\n` +
                            `• 604800 - 7 days\n` +
                            `• 7776000 - 90 days`
                        );
                        break;
                    }
                    await client.updateDefaultDisappearingMode(disappearingSeconds);
                    const disappearText = disappearingSeconds === 0 ? 'OFF' : `${disappearingSeconds} seconds`;
                    await client.sendMessage(msgFrom, `✅ Default disappearing mode set to: *${disappearText}*`);
                } catch (error) {
                    console.error('Error updating default disappearing mode:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to update: ${error.message}`);
                }
                break;

            case '!updatestatus':
                try {
                    if (!args) {
                        await client.sendMessage(msgFrom, '❌ Please provide a new status.\nUsage: !updatestatus <text>');
                        break;
                    }
                    await client.updateProfileStatus(args.trim());
                    await client.sendMessage(msgFrom, `✅ Profile status updated successfully!`);
                } catch (error) {
                    console.error('Error updating profile status:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to update profile status: ${error.message}`);
                }
                break;

            case '!updatename':
                try {
                    if (!args) {
                        await client.sendMessage(msgFrom, '❌ Please provide a new name.\nUsage: !updatename <text>');
                        break;
                    }
                    const newName = args.trim().toTitleCase();
                    await client.updateProfileName(newName);
                    await client.sendMessage(msgFrom, `✅ *${newName}* \nProfile name updated successfully!`);
                } catch (error) {
                    console.error('Error updating profile name:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to update profile name: ${error.message}`);
                }
                break;

            case '!statustext':
                try {
                    await client.sendStatus({
                        text: 'This is a test status!',
                        backgroundColor: STATUS_BACKGROUNDS.solid.orange,
                        font: STATUS_FONTS.SANS_SERIF
                    }, [msgFrom]);
                    await client.sendMessage(msgFrom, '✅ Status posted successfully!');
                } catch (error) {
                    console.error('Error sending text status:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to post text status: ${error.message}`);
                }
                break;

            case '!statusimage':
                try {
                    if (fs.existsSync('./example.jpg')) {
                        await client.sendStatus({
                            imagePath: './example.jpg',
                            caption: args || 'Beautiful day from Innovators Soft! ☀️'
                        }, [msgFrom]);
                        await client.sendMessage(msgFrom, '✅ Image status posted successfully!');
                    } else {
                        await client.sendMessage(msgFrom, '❌ example.jpg not found for status demonstration.');
                    }
                } catch (error) {
                    console.error('Error sending image status:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to post image status: ${error.message}`);
                }
                break;

            case '!statusvideo':
                try {
                    if (fs.existsSync('./example.mp4')) {
                        await client.sendStatus({
                            videoPath: './example.mp4',
                            caption: args || 'Check this out! 🎬',
                            isGif: false
                        }, [msgFrom]);
                        await client.sendMessage(msgFrom, '✅ Video status posted successfully!');
                    } else {
                        await client.sendMessage(msgFrom, '❌ example.mp4 not found for status demonstration.');
                    }
                } catch (error) {
                    console.error('Error sending video status:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to post video status: ${error.message}`);
                }
                break;

            case '!statusvoice':
                try {
                    if (fs.existsSync('./example.ogg')) {
                        await client.sendStatus({
                            audioPath: './example.ogg'
                        }, [msgFrom]);
                        await client.sendMessage(msgFrom, '✅ Voice note status posted successfully!');
                    } else {
                        await client.sendMessage(msgFrom, '❌ example.ogg not found for status demonstration. Try finding a small audio file.');
                    }
                } catch (error) {
                    console.error('Error sending voice note status:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to post voice note status: ${error.message}`);
                }
                break;

            case '!groupstatus':
                try {
                    if (!msgFrom.endsWith('@g.us')) {
                        await client.sendMessage(msgFrom, '❌ This command only works inside a group chat (@g.us).');
                        break;
                    }

                    await client.sendGroupStatus(msgFrom, {
                        text: 'this is group status'
                    });

                    if (fs.existsSync('./example.jpg')) {
                        await client.sendGroupStatus(msgFrom, {
                            image: { url: './example.jpg' },
                            caption: args || 'Hello Group!'
                        });
                        await client.sendMessage(msgFrom, '✅ Group status posted successfully!');
                    } else {
                        await client.sendMessage(msgFrom, '❌ example.jpg not found for group status demonstration.');
                    }
                } catch (error) {
                    console.error('Error sending group status:', error);
                    await client.sendMessage(msgFrom, `❌ Failed to post group status: ${error.message}`);
                }
                break;

            case '!messages':
                const history = client.getStoredMessages(msgFrom);
                let historyText = `*💾 Stored Messages for this chat (${history.length}):*\n\n`;
                history.slice(-10).forEach((m, i) => {
                    const content = m.message.conversation || m.message.extendedTextMessage?.text || "[Media/Other]";
                    historyText += `${i + 1}. ID: ${m.key.id}\n   Text: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}\n\n`;
                });
                await client.sendMessage(msgFrom, historyText);
                break;

            case '!message':
                if (!args) {
                    await client.sendMessage(msgFrom, "❌ Please provide a message ID.");
                    break;
                }
                const storedMsg = client.getStoredMessage({ remoteJid: msgFrom, id: args.trim(), fromMe: false });
                if (storedMsg) {
                    await client.sendMessage(msgFrom, `✅ Found message!\n\nContent: ${JSON.stringify(storedMsg.message, null, 2).substring(0, 1000)}`);
                } else {
                    await client.sendMessage(msgFrom, "❌ Message not found in store.");
                }
                break;

            case '!stats':
                const stats = client.getStoreStats();
                await client.sendMessage(msgFrom, `*📊 Message Store Statistics*\n\n• Total Chats: ${stats.totalChats}\n• Total Messages: ${stats.totalMessages}\n• Total Deleted: ${stats.totalDeleted}`);
                break;

            case '!allmessages':
                const allMsgs = client.getAllStoredMessages();
                const activeChats = client.getStoredChatIds();
                await client.sendMessage(msgFrom, `*🌐 Global Message Store*\n\n• Total Messages Held: ${allMsgs.length}\n• Total Active Chats: ${activeChats.length}\n\n*Active JIDs:* \n${activeChats.join('\n')}`);
                break;

            case '!savestore':
                await client.sendMessage(msgFrom, '💾 Saving message store to file...');
                const saveResult = await client.saveMessageStore();
                if (saveResult.success) {
                    await client.sendMessage(msgFrom,
                        `✅ *Store Saved Successfully*\n\n` +
                        `• Messages: ${saveResult.messageCount}\n` +
                        `• Path: ${saveResult.path}\n` +
                        `• Saved at: ${saveResult.savedAt.toLocaleString()}`
                    );
                } else {
                    await client.sendMessage(msgFrom, `❌ Failed to save store: ${saveResult.error}`);
                }
                break;

            case '!loadstore':
                await client.sendMessage(msgFrom, '📂 Loading message store from file...');
                const loadResult = await client.loadMessageStore();
                if (loadResult.success) {
                    await client.sendMessage(msgFrom,
                        `✅ *Store Loaded Successfully*\n\n` +
                        `• Messages: ${loadResult.messageCount}\n` +
                        `• Loaded from: ${loadResult.loadedFrom}`
                    );
                } else {
                    await client.sendMessage(msgFrom,
                        `⚠️ Could not load store\n` +
                        `Reason: ${loadResult.reason || loadResult.error}`
                    );
                }
                break;
        }
    })

    // Listen for errors
    client.on('error', error => {
        console.error('Client Error:', error)
    })
}

start();
