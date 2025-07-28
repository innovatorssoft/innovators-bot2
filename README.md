# INNOVATORS SOFT WhatsApp Bot 2

A powerful WhatsApp client library that provides seamless integration between Baileys and WhatsApp-web.js style APIs. This library makes it easy to create WhatsApp bots and automation tools with a familiar interface.

## Features

- 🚀 Easy to use, familiar WhatsApp-web.js style API
- 📱 Multi-device support
- 💬 Send and receive messages
- 📸 Media handling (images, videos, documents)
- 👥 Group management
- 💾 Message history and chat management
- 🔄 Auto-reconnect functionality
- 📝 Read receipts

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
// Send a text message
await client.sendMessage('1234567890@s.whatsapp.net', 'Hello world!')

// Send a reply
await client.reply('1234567890@s.whatsapp.net', 'This is a reply', {
    quoted: originalMessage
})

// Send with mentions
await client.sendMessage('1234567890@s.whatsapp.net', {
    type: 'text',
    text: 'Hey @user!',
    mentions: ['user@s.whatsapp.net']
})
```

### 2. Media Handling

```javascript
// Send an image
await client.sendMedia('1234567890@s.whatsapp.net', './image.jpg', {
    caption: 'Check out this image!'
})

// Send a document
await client.sendDocument('1234567890@s.whatsapp.net', './document.pdf', 
    'Check out this document!'
)
```

### 3. Group Management

```javascript
// Get all groups
const groups = await client.getAllGroups()

// Add participant to group
await client.changeGroupParticipants(groupId, ['1234567890@s.whatsapp.net'], 'add')

// Remove participant
await client.changeGroupParticipants(groupId, ['1234567890@s.whatsapp.net'], 'remove')

// Promote to admin
await client.changeGroupParticipants(groupId, ['1234567890@s.whatsapp.net'], 'promote')

// Demote admin
await client.changeGroupParticipants(groupId, ['1234567890@s.whatsapp.net'], 'demote')
```

### 4. Interactive Messages

#### Buttons
```javascript
// Send interactive buttons
await client.sendButtons('1234567890@s.whatsapp.net', {
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

### 4. Message History

```javascript
// Get chat history
const messages = await client.loadMessages(chatId, 50)

// Get specific message
const message = await client.loadMessage(chatId, messageId)
```

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
- `!mention` - Mention you in a message
- `!reply` - Reply to your message
- `!react` - React to your message with ❤️
- `!read` - Mark messages as read
- `!typing` - Show typing indicator
- `!presence` - Set online presence

### Media & Content
- `!media` - Send an example image
- `!doc` - Send an example document
- `!location` - Send a location
- `!contact` - Send a contact card

### Group Management
- `!groups` - List all your groups
- `!add <number>` - Add participant to group
- `!remove <number>` - Remove participant from group
- `!promote <number>` - Promote participant to admin
- `!demote <number>` - Demote admin to participant
- `!list` - Show interactive list message

### Interactive Messages
- `!buttons` - Show interactive buttons
- `!list` - Display a scrollable list
- `!logout` - Logout from current session

## Event Handling

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

### Message Events
```javascript
// When a new message is received
client.on('message', async msg => {
    console.log('Message from:', msg.from)
    console.log('Message content:', msg.body)
    
    // Mark message as read
    await client.readMessage(msg.raw.key)
    
    // Handle different message types
    if (msg.hasMedia) {
        console.log('Message contains media')
        // Handle media message
    }
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

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Credits

Developed by [Innovators Soft](https://facebook.com/innovatorssoft). Based on the [@itsukichan/baileys](https://github.com/itsukichann/baileys) library.
