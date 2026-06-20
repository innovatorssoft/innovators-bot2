# INNOVATORS SOFT WhatsApp Bot 2

A powerful WhatsApp client library that provides seamless integration between Baileys and WhatsApp-web.js style APIs. This library makes it easy to create WhatsApp bots and automation tools with a familiar interface.

## Community

> Join our Discord server for support, updates, and discussions:
> https://discord.gg/G3RfM6FDHS

## Features

- 🚀 Easy to use, familiar WhatsApp-web.js style API
- 📱 Multi-device support (Baileys v7.x.x)
- 💬 Send and receive messages
-  Message reactions (add/remove emoji reactions)
- 📸 Media handling (images, videos, documents)
- � Mentions support in text and media messages
- �👥 Group management
- 💾 Message history and chat management
- 🔄 Auto-reconnect functionality
- 📝 Read receipts
- 🔐 LID (Local Identifier) support for enhanced privacy
- 🗂️ Signal repository store for LID/PN mapping
- 🧩 Interactive buttons support for both text and media (URL or local file)

## Installation

```bash
npm install innovators-bot2
```

## Quick Start With Qr Code 

```javascript
const { WhatsAppClient } = require('innovators-bot2')
const qrcode = require('qrcode-terminal')

// Create client instance
const client = new WhatsAppClient({ sessionName: ".Sessions" });

// Handle QR Code
client.on('qr', qr => {
    qrcode.generate(qr, { small: true })
})

// Handle ready event
client.on('connected', () => {
    console.log('Client is ready!')
})

// Connect to WhatsApp
client.connect()
```
## Quick Start With Pairing code

```javascript
const { WhatsAppClient } = require('innovators-bot2')
const qrcode = require('qrcode-terminal')
const config = require('./config.json');

// Get authmethod from config file (default to 'qr' if not specified)
const authMethod =  (config.whatsapp && config.whatsapp.authMethod) || 'qr';

const client = new WhatsAppClient({
    sessionName: ".Sessions",
    authmethod: authMethod
});

// Handle pairing code event
client.on('pairing-code', (code) => {
    console.log('Pairing Code:', code)
})

// Handle ready event
client.on('connected', () => {
    console.log('Client is ready!')
})

// Connect to WhatsApp
client.connect()
```

## Usage Examples

### 1. Basic Messaging

```javascript
// Determine the correct reply target (group JID for groups, sender JID for DMs)
const isGroupMsg = msg.isGroup;
const msgFrom = isGroupMsg ? msg.from : msg.sender;

// Send a text message
await client.sendMessage(msgFrom, 'Hello world!')

// Send a reply
await msg.reply('This is a reply message')

// Mention a specific user
// Use msg.sender (the person's JID), NOT msg.from (which is the group JID in groups)
const number = msg.sender.split('@')[0]
await client.sendMessage(msgFrom, {
    type: 'text',
    text: `Hey @${number}! How are you?`,
    mentions: [number]
})

// Mention all members in a group (only works in groups)
await client.sendMessage(msgFrom, {
    type: 'text',
    text: 'Hey @all! How are you?',
    mentions: ['@all']
})

// You can also use the explicit mentionAll flag
await client.sendMessage(msgFrom, {
    type: 'text',
    text: 'Attention everyone!',
    mentionAll: true
})
```

> **Note on `msg.from` vs `msg.sender`:**
> - `msg.from` — The chat JID. For groups this is the group ID (e.g. `120363...@g.us`), for DMs it's the person's JID.
> - `msg.sender` — The actual person who sent the message (always a user JID like `923001234567@s.whatsapp.net`).
> - When mentioning a user, always use `msg.sender` (not `msg.from`) to get the correct user JID.

### Call Methods

```javascript
// Initiate a voice call
const { callId } = await client.initiateCall(jid)

// Initiate a video call
const videoCall = await client.initiateCall(jid, { isVideo: true })

// Cancel an outgoing call
await client.cancelCall(callId, jid)
```

### 2. Media Handling

```javascript
// Send an image
await client.sendMedia('1234567890@s.whatsapp.net', './image.jpg', {
    caption: 'Check out this image!'
})

// Send an image with mentions
await client.sendMedia('1234567890@s.whatsapp.net', './image.jpg', {
    caption: 'Hey @user, check this out!',
    mentions: ['user@s.whatsapp.net']
})

// Send a document
await client.sendDocument('1234567890@s.whatsapp.net', './document.pdf', 
    'Check out this document!'
)

// Send a document with mentions (caption object is supported)
await client.sendDocument('1234567890@s.whatsapp.net', './document.pdf', {
    caption: 'Hey @user, please read this',
    mentions: ['user@s.whatsapp.net']
})
```

### 3. Sticker Management

Create stickers easily from any image buffer with automatic conversion and metadata support.

```javascript
const fs = require('fs');

// Send a sticker from an image or video buffer
const buffer = fs.readFileSync('./image.jpg');
await client.sendSticker('1234567890@s.whatsapp.net', buffer, {
    packName: 'Innovators',
    author: 'Innovators Bot',
    type: 'full', // 'full' or 'crop'
    quality: 50
});
```

### 4. Anti-Delete System

The library includes a built-in Anti-Delete system that tracks deleted messages in real-time.

```javascript
// Listen for deleted messages
client.on('message-deleted', async (data) => {
    console.log(`User ${data.jid} deleted a message!`);
    
    // Content of the deleted message
    const original = data.originalMessage;
    
    // Reply to the chat with the deleted content
    await client.sendMessage(data.jid, 'I saw that! 😉', { 
        quoted: original 
    });
});
```

### 5. Poll Votes Decryption

Listen for real-time updates when users cast or change their votes on a poll you created. The votes are automatically decrypted, aggregated, and their internal LID JIDs are resolved to Phone Number JIDs!

```javascript
client.on('poll-votes-update', async (data) => {
    console.log(`\n📊 Poll Votes Updated in ${data.jid}!`);
    console.log('Voter who cast/updated the vote:', data.voter);
    
    // 1. Get original poll creation details (Question, Options, etc.)
    const pollCreation = data.pollCreationMessage;
    if (pollCreation && pollCreation.message) {
        const pollMessage = pollCreation.message.pollCreationMessage ||
            pollCreation.message.pollCreationMessageV2 ||
            pollCreation.message.pollCreationMessageV3;

        if (pollMessage) {
            console.log('Question:', pollMessage.name);
            console.log('Options:', pollMessage.options?.map(o => o.optionName) || []);
        }
    }
    
    // 2. View accumulated vote breakdown & totals
    let totalVotesCount = 0;
    data.pollUpdate.forEach((option) => {
        console.log(`- ${option.name}: ${option.voters.length} vote(s) ${JSON.stringify(option.voters)}`);
        totalVotesCount += option.voters.length;
    });
    console.log('Total Votes Cast:', totalVotesCount);

    // 3. Find the winning option
    const winner = data.pollUpdate.reduce((prev, current) =>
        prev.voters.length > current.voters.length ? prev : current);
    console.log(`Winning Option: ${winner.name} with ${winner.voters.length} vote(s)`);
});
```

### 6. Group Management

```javascript
// Get all groups
const groups = await client.getAllGroups()
groups.forEach(g => console.log(g.subject, g.id, g.notify, g.participants.length))

// Get group metadata (participants, name, description, settings...)
const metadata = await client.getGroupMetadata(groupId)
console.log(metadata.id, metadata.subject, metadata.desc, metadata.notify)
console.log('Owner:', metadata.owner, 'Created:', new Date(metadata.creation * 1000))
console.log('Announce:', metadata.announce, 'Restrict:', metadata.restrict)

// Access participants with roles and notify names
metadata.participants.forEach(p => {
    const role = p.admin === 'superadmin' ? 'Super Admin'
               : p.admin === 'admin' ? 'Admin' : 'Member'
    console.log(`${p.id} - ${role} - Name: ${p.notify || 'N/A'}`)
})

// Create a new group
const newGroup = await client.createGroup('Group Name', ['1234567890@s.whatsapp.net'])
console.log('Created group:', newGroup.id)

// Change group subject (name)
await client.changeGroupSubject(groupId, 'New Group Name')

// Change group description
await client.changeGroupDescription(groupId, 'New description for the group')

// Change group settings
// Options: 'announcement' (only admins send), 'not_announcement' (everyone sends),
//          'locked' (only admins edit info), 'unlocked' (everyone edits info)
await client.changeGroupSettings(groupId, 'announcement')

// Get group invite code
const code = await client.getGroupInviteCode(groupId)
console.log('Invite link: https://chat.whatsapp.com/' + code)

// Revoke invite code (generates a new one)
const newCode = await client.revokeGroupInviteCode(groupId)
console.log('New invite link: https://chat.whatsapp.com/' + newCode)

// Join group by invite code
const joinedGroupId = await client.joinGroupByInviteCode('AbCdEfGhIjK')
// Also accepts full URL - it strips the prefix automatically
await client.joinGroupByInviteCode('https://chat.whatsapp.com/AbCdEfGhIjK')

// Get group info by invite code (without joining)
const groupInfo = await client.getGroupInfoByInviteCode('AbCdEfGhIjK')
console.log('Group name:', groupInfo.subject)

// Leave a group
await client.leaveGroup(groupId)

// Add participant to group
// Note: If adding fails due to user's privacy settings (403), 
// an invitation link is automatically sent to the user instead.
const result = await client.changeGroupParticipants(groupId, ['1234567890@s.whatsapp.net'], 'add')

if (result[0].status === 403 && result[0].invitationSent) {
    console.log('User has privacy settings enabled. Invitation link sent!')
}

// Send a manual group invitation link
await client.sendGroupInvitation(groupId, '1234567890@s.whatsapp.net', 'Join my group!')

// Remove participant
await client.changeGroupParticipants(groupId, ['1234567890@s.whatsapp.net'], 'remove')

// Promote to admin
await client.changeGroupParticipants(groupId, ['1234567890@s.whatsapp.net'], 'promote')

// Demote admin
await client.changeGroupParticipants(groupId, ['1234567890@s.whatsapp.net'], 'demote')

// Get pending join requests
const requests = await client.getGroupJoinRequests(groupId)
console.log('Pending requests:', requests)

// Approve/Reject join requests
await client.handleGroupJoinRequest(groupId, ['1234567890@s.whatsapp.net'], 'approve')
await client.handleGroupJoinRequest(groupId, ['1234567890@s.whatsapp.net'], 'reject')

// Toggle ephemeral (disappearing) messages
// Options: 0 (off), 86400 (24h), 604800 (7d), 7776000 (90d)
await client.toggleGroupEphemeral(groupId, 86400)

// Change who can add members
// Options: 'all_member_add' or 'admin_add'
await client.changeGroupAddMode(groupId, 'admin_add')
```

### 6. Privacy Management

```javascript
// Block a user
await client.blockUser('1234567890@s.whatsapp.net')

// Unblock a user
await client.unblockUser('1234567890@s.whatsapp.net')

// Get all privacy settings
const settings = await client.getPrivacySettings()
console.log('Privacy settings:', settings)

// Get blocked contacts list
const blocklist = await client.getBlockList()
console.log('Blocked users:', blocklist)

// Update last seen privacy
// Options: 'all' | 'contacts' | 'contact_blacklist' | 'none'
await client.updateLastSeenPrivacy('contacts')

// Update online status privacy
// Options: 'all' | 'match_last_seen'
await client.updateOnlinePrivacy('match_last_seen')

// Update profile picture privacy
// Options: 'all' | 'contacts' | 'contact_blacklist' | 'none'
await client.updateProfilePicturePrivacy('contacts')

// Update status privacy
// Options: 'all' | 'contacts' | 'contact_blacklist' | 'none'
await client.updateStatusPrivacy('contacts')

// Update read receipts privacy
// Options: 'all' | 'none'
await client.updateReadReceiptsPrivacy('all')

// Update who can add you to groups
// Options: 'all' | 'contacts' | 'contact_blacklist'
await client.updateGroupsAddPrivacy('contacts')

// Update default disappearing mode for new chats
// Options: 0 (off), 86400 (24h), 604800 (7d), 7776000 (90d)
await client.updateDefaultDisappearingMode(604800)

// Update profile status
await client.updateProfileStatus('Hello World!')

// Update profile name
await client.updateProfileName('My name')
```

### 7. Interactive Messages

#### Buttons
```javascript
// Send interactive buttons
await client.sendButtons('1234567890@s.whatsapp.net', {
    text: 'Do you like this bot?',
    title: 'Feedback',
    subtitle: 'Let us know!',
    footer: 'Powered by Innovators Soft',
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

// Send interactive buttons with an image from URL + caption
await client.sendButtons('1234567890@s.whatsapp.net', {
    image: { url: 'https://example.com/image.jpg' },
    caption: 'Body',
    title: 'Title',
    subtitle: 'Subtitle',
    footer: 'Footer',
    interactiveButtons: [
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: 'DisplayText',
                id: 'ID1'
            })
        }
    ],
    hasMediaAttachment: false
});

// Send interactive buttons with a local image file + caption
await client.sendButtons('1234567890@s.whatsapp.net', {
    imagePath: './image.jpg',
    caption: 'Body',
    title: 'Title',
    subtitle: 'Subtitle',
    footer: 'Footer',
    interactiveButtons: [
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: 'DisplayText',
                id: 'ID1'
            })
        }
    ]
});
```

#### List Messages
```javascript
// Send interactive list
await client.SendList('1234567890@s.whatsapp.net', {
    text: 'Please select an option:',
    title: 'Main Menu',
    buttonText: 'View Options',
    footer: 'Scroll to see more options',
    sections: [
        {
            title: 'Account',
            rows: [
                { title: 'Profile', id: 'profile', description: 'View your profile' },
                { title: 'Settings', id: 'settings', description: 'Account settings' }
            ]
        },
        {
            title: 'Help',
            rows: [
                { title: 'Support', id: 'support', description: 'Contact support' },
                { title: 'About', id: 'about', description: 'About this bot' }
            ]
        }
    ]
});
```

#### Cards Messages
```javascript
// Send interactive cards
await client.sendcards('1234567890@s.whatsapp.net', {
    text: 'Body Message',
    title: 'Title Message',
    subtile: 'Subtitle Message',
    footer: 'Footer Message',
    cards: [
        {
            image: { url: 'https://example.com/image1.jpg' }, // or buffer
            title: 'Title Card 1',
            body: 'Body Card 1',
            footer: 'Footer Card 1',
            buttons: [
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: 'Button 1',
                        id: 'id1'
                    })
                },
                {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: 'Open Link',
                        url: 'https://www.example.com'
                    })
                }
            ]
        },
        {
            video: { url: 'https://example.com/video1.mp4' }, // or buffer
            title: 'Title Card 2',
            body: 'Body Card 2',
            footer: 'Footer Card 2',
            buttons: [
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: 'Button 2',
                        id: 'id2'
                    })
                }
            ]
        }
    ]
});
```

#### Interactive Messages (V2)

Modern interactive message generation with simplified API.

**Quick Reply Buttons (V2)**
```javascript
await client.sendQuickReplyV2(jid, 'Please select an option below:', [
    { id: 'btn-1', displayText: '✅ Accept' },
    { id: 'btn-2', displayText: '❌ Reject' }
], { footer: 'Powered by Innovators Soft' });
```

**URL Button (V2)**
```javascript
await client.sendUrlButtonV2(jid, 'Visit our website for more info', [
    { displayText: '🌐 Open Website', url: 'https://example.com' }
], { title: 'Product Info', footer: 'Click to open' });
```

**Copy Code Button (V2)**
```javascript
await client.sendCopyCodeV2(jid, 'Your OTP Code is:', '123456', '📋 Copy Code');
```

**Combined Buttons (Mix URL, Reply, Copy, Call) (V2)**
```javascript
await client.sendCombinedButtonsV2(jid, 'Choose an action:', [
    { type: 'reply', displayText: '🛒 Order Now', id: 'order' },
    { type: 'url', displayText: '🌐 Website', url: 'https://example.com' },
    { type: 'call', displayText: '📞 Phone', phoneNumber: '+923224559543' },
    { type: 'copy', displayText: '📋 Copy Promo', copyCode: 'PROMO2024' }
], { title: 'Main Menu', footer: 'Innovators Soft' });
```

**List Message (V2)**
```javascript
await client.sendListV2(jid, {
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
        }
    ]
});
```

### 8. Rich AI Messaging

Send Meta AI-style formatted responses like tables, lists, syntax-highlighted code blocks, and LaTeX expressions.

#### Send a Table
```javascript
await client.sendTable(
    jid,
    'Price List',
    ['Item', 'Qty', 'Price'],
    [
        ['Apple',  '3', '$1.50'],
        ['Banana', '6', '$0.90']
    ],
    msg.raw, // quoted message
    { headerText: 'Order Summary:', footer: 'Thank you!' }
);
```

#### Send a Rich List
```javascript
await client.sendRichList(
    jid,
    'Available Commands',
    ['!help', '!ping', '!menu', '!info'],
    msg.raw, // quoted message
    { headerText: 'Bot commands:', footer: 'Type any command' }
);
```

#### Send a Code Block
```javascript
await client.sendCodeBlock(
    jid,
    `console.log("Hello World");`,
    msg.raw, // quoted message
    { title: 'Example Code', language: 'javascript' }
);
```

#### Send LaTeX Text
```javascript
// Note: WhatsApp clients require a pre-rendered image URL to display LaTeX graphically. 
// This method sends the raw LaTeX text which may be invisible without an image url.
// The quoted message parameter can be omitted by passing the options directly.
await client.sendLatex(
    jid,
    { text: 'Quadratic formula:', expressions: [{ latexExpression: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' }] }
);
```

#### Send LaTeX with Image Rendering

Render a LaTeX expression to a PNG image using the online CodeCogs API, upload, and send.

```javascript
// Send a LaTeX expression as an image with no caption
await client.sendLatexImage(jid, 'E=mc^2');

// Send a LaTeX expression with a custom caption (omitting quoted message)
await client.sendLatexImage(jid, {
    formula: 'E=mc^2',
    caption: 'Mass-Energy Equivalence'
});
```

#### Send LaTeX Inline Images (Album)

Render multiple LaTeX expressions as an album message.

```javascript
// Send LaTeX images as an album with the formula strings as captions (omitting quoted message)
await client.sendLatexInlineImage(jid, {
    expressions: [
        { latexExpression: '\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}' },
        { latexExpression: '\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0\\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}' }
    ],
    caption: true // true: formula text as caption; string: overall custom caption; false/omit: no captions
});
```

#### Fully Custom Rich AI Message
```javascript
await client.sendRichMessage(
    jid,
    [
        { messageType: 2, messageText: '🤖 *AI Response*' },
        { messageType: 5, codeMetadata: { codeLanguage: 'python', codeBlocks: [{ highlightType: 1, codeContent: 'print("Hello")' }] } }
    ],
    msg.raw // quoted message
);
```

#### Send Markdown
```javascript
await client.sendMarkdown(
    jid,
    '# H1\n## H2\n==Highlighted==\n_Italics_ and **Bold**!',
    msg.raw // quoted message (or null)
);
```

#### Send Rich Response using sendMessage
```javascript
// Text + syntax-highlighted code block
await client.sendMessage(jid, {
    richResponse: {
        text: 'Here is a JavaScript example:',
        code: `const greet = (name) => {\n  console.log('Hello, ' + name)\n}\ngreet('World')`,
        language: 'javascript' // 'javascript' | 'typescript' | 'python' | 'js' | 'ts' | 'py'
    }
});
```

### 9. Typing & Presence Control

Use `createPresenceController` for manual or standalone typing/recording presence control — without needing the auto-reply system.

```javascript
const typing = client.createPresenceController();

// Show "typing..." for 2 s, then send the message — all in one call
const sent = await typing.simulateTyping(jid, 2000, async () => {
    await client.sendMessage(jid, 'Here is your answer! ✅');
});

// Manual start (auto-pauses after 5 s by default)
await typing.startTyping(jid, { duration: 5000 });

// Manual stop
await typing.stopTyping(jid);

// Voice note recording indicator
await typing.startRecording(jid, { duration: 3000 });

// Stop all active indicators (e.g. on socket close)
await typing.stopAll();
```

### 10. Message History (Store)

The library includes a robust message store to keep track of chat history, even across reloads.

#### Basic Store Operations
```javascript
// Get all stored messages for a specific chat
const messages = client.getStoredMessages('1234567890@s.whatsapp.net');

// Get all stored messages across all chats
const allMessages = client.getAllStoredMessages();

// Get list of all chat JIDs in the store
const activeChats = client.getStoredChatIds();

// Get statistics about the message store
const stats = client.getStoreStats();
```

#### Message Store Persistence

The message store can be saved to and loaded from a file for consistency across restarts:

```javascript
// Initialize client with persistence configuration
const client = new WhatsAppClient({
    sessionName: 'my-session',
    messageStoreFilePath: './data/my-session/message-store.json', // Optional custom path
    autoSaveInterval: 5 * 60 * 1000, // Auto-save every 5 minutes (default)
    maxMessagesPerChat: 1000, // Maximum messages to keep per chat
    messageTTL: 24 * 60 * 60 * 1000 // Message time-to-live (24 hours default)
});

// The store will automatically:
// - Load from file when connected
// - Save to file when disconnected
// - Auto-save periodically (every 5 minutes by default)

// Manual save/load operations
await client.saveMessageStore(); // Returns {success, path, messageCount, savedAt}
await client.loadMessageStore(); // Returns {success, messageCount, loadedFrom}
```

**Features:**
- 💾 **Auto-save**: Automatically saves the store at regular intervals
- 🔄 **Auto-load**: Loads the store when connecting
- 🛡️ **Safe shutdown**: Saves the store before disconnecting
- 📊 **Change tracking**: Only saves when there are new messages
- 🗂️ **Custom paths**: Configure where to save the store file

#### Events
The message store emits events you can listen to:
- `message-stored`: Emitted when messages are added to the cache.
- `store-loaded`: Emitted when the store is loaded from file.
- `store-cleared`: Emitted when the entire store is cleared.
- `chat-store-cleared`: Emitted when a specific chat's history is cleared.

```javascript
client.on('message-stored', (messages) => {
    console.log('Messages cached:', messages.length);
});

client.on('store-loaded', (info) => {
    console.log(`Loaded ${info.messageCount} messages from file`);
});
```

### 11. Status / Story Posting

Post text, image, video, and voice note statuses easily using the `sendStatus` method.

| Feature | Description |
|---------|-------------|
| **Multi-Device Support** | Automatically handles `statusJidList` for correct visibility |
| **All Media Types** | Supports Text, Image, Video, GIF, and Voice Note statuses |
| **Rich Customization** | Supports backgrounds, fonts, and colors for text status |

#### Sending Text Status
```javascript
await client.sendStatus({
    text: 'Hello from Innovators Soft! 🌍',
    backgroundColor: '#34B7F1', // Hex color
    font: 2, // Norican font (0-9)
    textColor: '#FFFFFF'
}, ['1234567890@s.whatsapp.net']);
```

#### Sending Media Status
```javascript
// Image Status
await client.sendStatus({
    imagePath: './photo.jpg',
    caption: 'Beautiful day! ☀️'
}, ['1234567890@s.whatsapp.net']);

// Video/GIF Status
await client.sendStatus({
    videoPath: './video.mp4',
    caption: 'Check this out! 🎬',
    isGif: true
}, ['1234567890@s.whatsapp.net']);

// Voice Note Status
await client.sendStatus({
    audioPath: './voice.ogg'
}, ['1234567890@s.whatsapp.net']);
```

#### Status Visibility
> [!IMPORTANT]
> The second parameter of `sendStatus` is an array of JIDs (contacts) who should be able to see this status. On Multi-Device WhatsApp, statuses are NOT visible to anyone unless you explicitly include them in this list.

#### Helper Utilities
You can also access the underlying `StatusHelper` directly:
```javascript
const { StatusHelper, STATUS_BACKGROUNDS, STATUS_FONTS } = require('@innovatorssoft/baileys');

// Generate raw status content
const status = StatusHelper.text('Direct usage', STATUS_BACKGROUNDS.solid.purple);
await StatusHelper.send(client.sock, status, ['1234567890@s.whatsapp.net']);
```

---

## More Examples and Information

For a complete working example with message handling, group management, and error handling, check out our [`example.js`](https://github.com/innovatorssoft/innovators-bot2/blob/main/example.js) file. This example includes:

- 🔄 Connection handling and QR code generation
- 📨 Message handling with commands
- 👥 Group management examples
- ⚡ Event listeners for various scenarios
- 🛠️ Error handling and logging

Feel free to use this example as a starting point for your WhatsApp bot implementation.

## Bot Commands

The library includes example bot commands that you can use:

### Basic Commands
- `!ping` - Check if bot is alive
- `!echo <text>` - Echo back your text
- `!help` - Show all available commands

### Messaging
- `!mention` - Mention the sender in a message
- `!mentionall` - Mention all group members (groups only)
- `!reply` - Reply to your message
- `!react` - React to your message with ❤️
- `!read` - Mark messages as read
- `!typing` - Show typing indicator
- `!recording` - Show recording indicator
- `!paused` - Clear typing or recording indicator

### Media & Content
- `!media` - Send an example image
- `!doc` - Send an example document
- `!location` - Send a location
- `!contact` - Send a contact card
- `!sticker` - Create a sticker from an image
- `!ad` - Send an ad reply message

### Group Management
- `!groups` - List all your groups
- `!add <number>` - Add participant to group
- `!remove <number>` - Remove participant from group
- `!promote <number>` - Promote participant to admin
- `!demote <number>` - Demote admin to participant
- `!invite <number>` - Send group invite link to user
- `!creategroup <name>` - Create a new group
- `!groupsubject <name>` - Change group name
- `!groupdesc <text>` - Change group description
- `!groupsetting <setting>` - Change group settings (announcement/not_announcement/locked/unlocked)
- `!invitecode` - Get group invite code/link
- `!revokeinvite` - Revoke current invite code and generate new one
- `!leavegroup` - Leave the current group
- `!joingroup <code>` - Join a group by invite code
- `!groupinfo [jid|code]` - Get full group details (use in-group, by JID, or by invite code) — shows participants, roles, names, and group settings
- `!joinrequests` - List pending join requests
- `!approvejoin <number>` - Approve a join request
- `!rejectjoin <number>` - Reject a join request
- `!ephemeral <seconds>` - Toggle disappearing messages (0/86400/604800/7776000)
- `!addmode <mode>` - Change who can add members (all_member_add/admin_add)

### 🔒 Privacy
- `!block <number>` - Block a user
- `!unblock <number>` - Unblock a user
- `!privacy` - View all privacy settings
- `!blocklist` - List all blocked contacts
- `!lastseenprivacy <value>` - Update last seen privacy (all/contacts/contact_blacklist/none)
- `!onlineprivacy <value>` - Update online privacy (all/match_last_seen)
- `!pfpprivacy <value>` - Update profile picture privacy (all/contacts/contact_blacklist/none)
- `!statusprivacy <value>` - Update status privacy (all/contacts/contact_blacklist/none)
- `!readreceiptprivacy <value>` - Update read receipts privacy (all/none)
- `!groupaddprivacy <value>` - Update who can add you to groups (all/contacts/contact_blacklist)
- `!disappearing <seconds>` - Update default disappearing mode (0/86400/604800/7776000)
- `!updatestatus <text>` - Update profile status
- `!updatename <text>` - Update profile name

### Interactive Messages
- `!buttons` - Show interactive buttons
- `!list` - Display a scrollable list
- `!quickreplyv2` - Quick reply buttons V2
- `!urlbuttonv2` - URL button V2
- `!copycodev2` - Copy code button V2
- `!combinedv2` - Mixed buttons V2
- `!listv2` - Interactive list V2
- `!cards` - Show interactive cards message
- `!logout` - Logout from current session

### 💾 Message Store
- `!messages` - Get stored messages for current chat
- `!message <id>` - Get a specific message by ID
- `!stats` - View store capacity statistics

### 🛡️ Protection
- `Anti-Delete` - Automatically tracks and emits events for deleted messages

### 🔐 JID & LID/PN Management (v7.x.x)
- `!lid` - Get your LID (Local Identifier)
- `!pn <lid>` - Get phone number from a LID
- `!parse <jid>` - Parse detailed JID information
- `!normalize <number>` - Normalize a number to JID format

### Connection Events
```javascript
// When QR code is generated
client.on('qr', qr => {
    qrcode.generate(qr, { small: true })
})

// When connection is established
client.on('connected', () => {
    console.log('Client is ready!')
})

// When connection is in progress
client.on('connecting', (message) => {
    console.log('Connection status:', message)
})

// When disconnected
client.on('disconnected', (error) => {
    console.log('Client disconnected:', error)
})
```

### Contact Events
```javascript
// When contacts are received from history sync
client.on('contacts-received', (contacts) => {
    console.log(`Received ${contacts.length} contacts`);
})

// When new contacts are added/updated
client.on('contacts-upsert', (contacts) => {
    console.log(`New Contacts: ${contacts.length} contacts added/updated`);
})

// When existing contacts are updated (profile picture changes, etc.)
client.on('contacts-update', (updates) => {
    console.log(`Contact Updates: ${updates.length} contacts modified`);
})
```

### Message Events
```javascript
// When a new message is received
client.on('message', async msg => {
    console.log('Message from:', msg.from)       // Chat JID (group or DM)
    console.log('Sender:', msg.sender)            // Person who sent it
    console.log('Sender Name:', msg.raw.pushName) // Display name
    console.log('Message:', msg.body)
    console.log('Is Group:', msg.isGroup)
    
    // Determine reply target: group JID for groups, sender JID for DMs
    const isGroupMsg = msg.isGroup;
    const msgFrom = isGroupMsg ? msg.from : msg.sender;
    
    // Mark message as read
    await client.readMessage(msg.raw.key)
    
    // Reply back
    await msg.reply('Got your message!')
    
    // Handle different message types
    if (msg.hasMedia) {
        console.log('Message contains media')
        // Download media (image/video/audio/document)
        const media = await client.downloadMedia(msg)
        if (media) {
            const fs = require('fs')
            const fileName = `./download-${Date.now()}.${media.extension}`
            fs.writeFileSync(fileName, media.buffer)
            console.log('Saved media to:', fileName)
        }
    }
})
```

### Message Reaction Events

Listen for when users add or remove reactions (emojis) from messages:

```javascript
// When a message receives a reaction
client.on('message-reaction', async (reaction) => {
    console.log('Reaction received!')
    console.log('Chat:', reaction.from)
    console.log('Sender:', reaction.sender)
    console.log('Emoji:', reaction.emoji)
    console.log('Is removed:', reaction.isRemoved)
    
    // Check if reaction was added or removed
    if (reaction.isRemoved) {
        console.log('User removed their reaction')
    } else {
        console.log(`User reacted with: ${reaction.emoji}`)
    }
    
    // Access the message key that was reacted to
    console.log('Message ID:', reaction.messageKey.id)
    
    // For group messages, get the participant who reacted
    if (reaction.from.endsWith('@g.us')) {
        console.log('Participant who reacted:', reaction.sender)
    }
})
```

#### Reaction Event Data Structure

The `message-reaction` event provides the following data:

| Property | Type | Description |
|----------|------|-------------|
| `from` | `string` | Chat JID where the reaction occurred (prefers PN over LID) |
| `sender` | `string` | JID of the user who reacted (in groups, this is the participant) |
| `participant` | `string\|null` | Original participant JID (could be LID or PN) |
| `participantAlt` | `string\|null` | Alternate participant JID format |
| `emoji` | `string\|null` | The emoji used for the reaction (null if removed) |
| `isRemoved` | `boolean` | `true` if the reaction was removed, `false` if added |
| `messageKey` | `object` | The message key object that was reacted to |
| `timestamp` | `Date` | When the reaction event was processed |
| `raw` | `object` | Raw reaction data from Baileys |

#### Sending Reactions

You can also send reactions to messages programmatically:

```javascript
// React to a message
await client.sendMessage(chatId, {
    type: 'reaction',
    emoji: '❤️',
    messageKey: messageToReactTo.key
})

// Remove a reaction (send empty emoji)
await client.sendMessage(chatId, {
    type: 'reaction',
    emoji: '',
    messageKey: messageToReactTo.key
})
```

### LID Mapping Events
```javascript
// Listen for LID/PN mapping updates
client.on('lid-mapping-update', (update) => {
    console.log('New LID/PN mappings received:', update)
    // Handle new mappings as needed
})
```

### Error Handling

```javascript
// Global error handler
client.on('error', error => {
    console.error('Client Error:', error)
    // Handle specific error types
    if (error.message.includes('Connection Closed')) {
        console.log('Attempting to reconnect...')
        client.connect()
    }
})

// Example with try-catch
try {
    await client.sendMessage(to, message)
} catch (error) {
    console.error('Error sending message:', error)
    if (error.message.includes('Not connected')) {
        console.log('Reconnecting...')
        await client.connect()
    }
}
```

### Overview

This library fully supports Baileys v7.x.x LID (Local Identifier) system for enhanced privacy and WhatsApp's transition to username-based identification.

| Feature | Description |
|---------|-------------|
| **LID Support** | Full support for Local Identifiers alongside Phone Numbers |
| **Store Access** | Automatic initialization via `client.sock.signalRepository.lidMapping` |
| **Helper Methods** | `getLIDForPN()`, `getPNForLID()`, `getLIDsForPNs()` |
| **Event Handling** | `lid-mapping-update` event for real-time mapping updates |
| **Message Handling** | Automatic preference for PN over LID with fallback support |
| **Compatibility** | Backward compatible with v6.x code patterns |

### What are LIDs?

**LID (Local Identifier)** is WhatsApp's privacy feature that replaces phone numbers in large groups. Key points:

- **Unique per user** (not per group)
- Ensures user anonymity in large groups
- Allows messaging users via either LID or PN (Phone Number)
- Part of WhatsApp's transition to username system (@username)

#### JID Format Changes

- **PN (Phone Number)**: `1234567890@s.whatsapp.net` (traditional format)
- **LID**: `123456@lid` (new format)

### Accessing the Store

The store is automatically initialized when you create a WhatsAppClient and is accessible via the internal socket:

```javascript
const client = new WhatsAppClient({ sessionName: ".Sessions" });
await client.connect();

// Store is available internally as client.store
// Access via: client.sock.signalRepository.lidMapping
```

### Available Methods

The WhatsAppClient provides convenient methods to work with LID/PN mappings:

#### Quick Reference

```javascript
// Get LID from Phone Number
const lid = await client.getLIDForPN('1234567890@s.whatsapp.net');

// Get Phone Number from LID
const pn = await client.getPNForLID('123456@lid');

// Get multiple LIDs
const lids = await client.getLIDsForPNs(['phone1@s.whatsapp.net', 'phone2@s.whatsapp.net']);
```

#### Detailed Examples

```javascript
// Get LID from Phone Number
const lid = await client.getLIDForPN('1234567890@s.whatsapp.net');
console.log('LID:', lid);

// Get Phone Number from LID
const pn = await client.getPNForLID('123456@lid');
console.log('Phone Number:', pn);

// Get multiple LIDs from multiple PNs
const lids = await client.getLIDsForPNs([
    '1234567890@s.whatsapp.net',
    '0987654321@s.whatsapp.net'
]);
console.log('LIDs:', lids);
```

### Message Handling with LID Support

The library automatically handles both LID and PN formats in messages:

```javascript
client.on('message', async msg => {
    // msg.from will prefer PN over LID when available
    console.log('Message from:', msg.from);
    
    // Access raw message key for both formats
    const remoteJid = msg.raw.key.remoteJid;        // Primary JID
    const remoteJidAlt = msg.raw.key.remoteJidAlt; // Alternate JID
    
    // For group messages
    const participant = msg.raw.key.participant;       // Could be LID or PN
    const participantAlt = msg.raw.key.participantAlt; // Alternate format
    
    // Convert LID to PN if needed
    if (remoteJid.endsWith('@lid')) {
        const phoneNumber = await client.getPNForLID(remoteJid);
        console.log('Phone number:', phoneNumber);
    }
});
```

### Best Practices

#### 1. Prefer PN over LID for Compatibility

```javascript
const getPreferredJid = (messageKey) => {
    if (messageKey.remoteJidAlt?.endsWith('@s.whatsapp.net')) {
        return messageKey.remoteJidAlt; // Use PN
    }
    return messageKey.remoteJid; // Fallback to primary JID
};
```

#### 2. Convert LID to PN When Needed

```javascript
const convertToPN = async (jid) => {
    if (jid.endsWith('@lid')) {
        const pn = await client.getPNForLID(jid);
        return pn || jid; // Return PN if found, otherwise return LID
    }
    return jid;
};
```

#### 3. Handle Both Formats Gracefully

```javascript
// Always handle undefined returns
const lid = await client.getLIDForPN(phoneNumber);
if (lid) {
    console.log('LID found:', lid);
} else {
    console.log('No LID mapping available, using PN');
}
```

### Common Use Cases

#### Getting User's LID

```javascript
client.on('message', async msg => {
    if (msg.body === '!myid') {
        const lid = await client.getLIDForPN(msg.from);
        if (lid) {
            await msg.reply(`Your LID: ${lid}\nYour PN: ${msg.from}`);
        } else {
            await msg.reply('No LID found. You may be using a PN-only session.');
        }
    }
});
```

#### Resolving LID to Phone Number

```javascript
client.on('message', async msg => {
    if (msg.body.startsWith('!lookup ')) {
        const lid = msg.body.split(' ')[1];
        const phoneNumber = await client.getPNForLID(lid);
        
        if (phoneNumber) {
            await msg.reply(`Phone number: ${phoneNumber}`);
        } else {
            await msg.reply('No phone number found for that LID.');
        }
    }
});
```

#### Handling Group Messages with LIDs

```javascript
client.on('message', async msg => {
    if (msg.isGroup) {
        const participant = msg.raw.key.participant;
        const participantAlt = msg.raw.key.participantAlt;
        
        // Use alternate (PN) if available, otherwise use primary
        const senderJid = participantAlt || participant;
        
        console.log('Group message from:', senderJid);
        
        // Get LID if sender is using PN
        if (senderJid.endsWith('@s.whatsapp.net')) {
            const lid = await client.getLIDForPN(senderJid);
            console.log('Sender LID:', lid);
        }
    }
});
```

### Helper Functions

```javascript
// Check if JID is a Phone Number
const isPnUser = (jid) => {
    return jid?.endsWith('@s.whatsapp.net');
};

// Check if JID is a LID
const isLidUser = (jid) => {
    return jid?.endsWith('@lid');
};

// Get preferred JID format
const getPreferredFormat = async (jid, client) => {
    if (isLidUser(jid)) {
        const pn = await client.getPNForLID(jid);
        return pn || jid;
    }
    return jid;
};
```

### Authentication State Requirements

⚠️ **Important**: Your authentication state must support these keys:
- `lid-mapping` - Stores LID/PN mappings
- `device-list` - Manages linked devices
- `tctoken` - Token for communications

The library handles this automatically with `useMultiFileAuthState`.

### Migration from v6.x to v7.x

If you're upgrading from Baileys v6.x:

1. **Store access changed**: Access via `sock.signalRepository.lidMapping` instead of separate store parameter
2. **New message key fields**: Check for `remoteJidAlt` and `participantAlt`
3. **Event listener**: Add handler for `lid-mapping-update` event
4. **Function naming**: `isJidUser()` replaced with `isPnUser()`
5. **Automatic handling**: The WhatsAppClient already implements these changes

### Troubleshooting

#### Store is undefined

**Problem**: Cannot access LID store methods

**Solution**: Ensure client is connected before accessing store:
```javascript
await client.connect();
// Wait for 'connected' event
client.on('connected', async () => {
    // Now store methods are available
    const lid = await client.getLIDForPN(phoneNumber);
});
```

#### No LID found for PN

**Problem**: `getLIDForPN()` returns `undefined`

**Possible causes**:
- User hasn't migrated to LID system yet
- No LID/PN mapping received from WhatsApp server
- Using old session that doesn't support LIDs

**Solution**: Always handle `undefined` returns gracefully

### Additional Resources

For more detailed information about the LID system implementation, see:
- [LID_STORE_GUIDE.md](./LID_STORE_GUIDE.md) - Complete implementation guide
- [Baileys Migration Guide](https://baileys.wiki/docs/migration/to-v7.0.0/) - Official migration documentation
- [example.js](./example.js) - Working examples with LID handling
- [Read Baileys Documentation](https://innovatorssoftpk.com/)
- [Deep Knowlege](https://deepwiki.com/innovatorssoft/Baileys)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Credits

Developed by [Innovators Soft](https://facebook.com/innovatorssoft). Based on the [@itsukichan/baileys](https://github.com/itsukichann/baileys) library.

# Special Thanks
- [@whiskeysockets/baileys](https://github.com/whiskeysockets/Baileys)
- [@itsukichan](https://github.com/itsukichann)
- [All Contributors](https://github.com/innovatorssoft/Baileys/)
- [@ZenboBot](https://discordbot.innovatorssoftpk.com/) - AI Powered Baileys Bot
# Sponsor Me
Buy me a coffee - [Innovators Soft](https://facebook.com/innovatorssoft)
