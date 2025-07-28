const { WhatsAppClient } = require('./index')
const qrcode = require('qrcode-terminal')
const fs = require('fs');

// Load config from config.json
const config = require('./config.json');

// Get authmethod from config file (default to 'qr' if not specified)
const authMethod =  (config.whatsapp && config.whatsapp.authMethod) || 'qr';

const client = new WhatsAppClient({
    sessionName: ".Sessions",
    authmethod: authMethod
});

console.log(`Using auth method: ${authMethod}`);



// Handle QR Code
client.on('qr', qr => {
    console.log('QR Code received')
    qrcode.generate(qr, { small: true })
})

// Handle connection events
client.on('connecting', (message) => {
    console.log('Client status:', message)
})

client.on('connected', (user) => {
    console.log('Client is ready!', user)
})

client.on('disconnected', (error) => {
    console.log('Client disconnected:')
})

// Connect to WhatsApp
client.connect()

// Listen for incoming messages
client.on('message', async msg => {   
    console.log ('Message Received');
    console.log ('Number:', msg.from);
    console.log ('Sender:', msg.raw.pushName);
    console.log ('Message:', msg.body);
    // Mark the message as read
    await client.readMessage(msg.raw.key)
    
    const command = msg.body.split(' ')[0]
    const args = msg.body.split(' ').slice(1).join(' ')

    switch (command) {
        case '!ping':
            await client.sendMessage(msg.from, 'pong')
            break

        case '!echo':
            if (args) {
                await client.sendMessage(msg.from, args)
            } else {
                await client.sendMessage(msg.from, 'Please provide text to echo')
            }
            break

        case '!mention':
            const number = msg.from.split('@')[0]
            await client.sendMessage(msg.from, {
                type: 'text',
                text: `Hey @${number}! How are you?`,
                mentions: [msg.from]
            })
            break

        case '!reply':
            await msg.reply('This is a reply message')
            break

        case '!location':
            await client.sendMessage(msg.from, {
                type: 'location',
                latitude: 24.121231,
                longitude: 55.1121221
            })
            break

        case '!contact':
            await client.sendMessage(msg.from, {
                type: 'contact',
                fullName: 'John Doe',
                organization: 'Example Corp',
                phoneNumber: '1234567890'
            })
            break

        case '!react':
            await client.sendMessage(
                msg.from,
                {
                    type: 'reaction',
                    emoji: '💖',
                    message: { key: msg.raw.key }
                }
            )
            break
        case '!media':
            if (fs.existsSync('./example.jpg')) {
                await client.sendMedia(msg.from, './example.jpg', {
                    caption: 'Check out this image!'
                })
            } else {
                await client.sendMessage(msg.from, 'Example image not found')
            }
            break

        case '!doc':
            if (fs.existsSync('./example.pdf')) {
                await client.sendDocument(msg.from, './example.pdf', 'Check out this document!')
            } else {
                await client.sendMessage(msg.from, 'Example document not found')
            }
            break
        
        case '!list':
            await client.SendList(msg.from, {
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
                            { title: 'Orders', id: 'orders', description: 'View order history' },
                            { title: 'Wishlist', id: 'wishlist', description: 'Your saved items' },
                            { title: 'Addresses', id: 'addresses', description: 'Manage shipping addresses' },
                            { title: 'Help Center', id: 'help', description: 'Get help and support' },
                            { title: 'Contact Us', id: 'contact', description: 'Reach out to our team' },
                            { title: 'FAQs', id: 'faqs', description: 'Frequently asked questions' },
                            { title: 'About Us', id: 'about', description: 'Learn about our company' },
                            { title: 'Careers', id: 'careers', description: 'Join our team' },
                            { title: 'Blog', id: 'blog', description: 'Read our latest articles' },
                            { title: 'Newsletter', id: 'newsletter', description: 'Subscribe to updates' },
                            { title: 'Events', id: 'events', description: 'Upcoming events' },
                            { title: 'Webinars', id: 'webinars', description: 'Join live webinars' },
                            { title: 'Tutorials', id: 'tutorials', description: 'Learn how to use features' },
                            { title: 'Documentation', id: 'docs', description: 'Technical documentation' },
                            { title: 'API', id: 'api', description: 'Developer API' },
                            { title: 'Integrations', id: 'integrations', description: 'Third-party integrations' },
                            { title: 'Download', id: 'download', description: 'Download our app' },
                            { title: 'Pricing', id: 'pricing', description: 'View pricing plans' },
                            { title: 'Upgrade', id: 'upgrade', description: 'Upgrade your plan' },
                            { title: 'Refer a Friend', id: 'refer', description: 'Earn rewards' },
                            { title: 'Feedback', id: 'feedback', description: 'Share your thoughts' },
                            { title: 'Report Issue', id: 'report', description: 'Report a problem' },
                            { title: 'Language', id: 'language', description: 'Change language' }
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
                            { title: 'Backup', id: 'backup', description: 'Backup your data' },
                            { title: 'Restore', id: 'restore', description: 'Restore from backup' },
                            { title: 'Export Data', id: 'export', description: 'Download your data' },
                            { title: 'Delete Account', id: 'delete', description: 'Permanently remove account' },
                            { title: 'Terms of Service', id: 'tos', description: 'Read terms and conditions' },
                            { title: 'Privacy Policy', id: 'privacy_policy', description: 'How we handle your data' },
                            { title: 'Cookie Policy', id: 'cookies', description: 'About our use of cookies' },
                            { title: 'Accessibility', id: 'accessibility', description: 'Accessibility features' },
                            { title: 'Version', id: 'version', description: 'App version information' },
                            { title: 'Changelog', id: 'changelog', description: 'Recent updates' },
                            { title: 'Roadmap', id: 'roadmap', description: 'Upcoming features' },
                            { title: 'Status', id: 'status', description: 'Service status' },
                            { title: 'Legal', id: 'legal', description: 'Legal information' },
                            { title: 'Partners', id: 'partners', description: 'Our partners' },
                            { title: 'Press', id: 'press', description: 'Press resources' },
                            { title: 'Investors', id: 'investors', description: 'Investor relations' },
                            { title: 'Affiliates', id: 'affiliates', description: 'Become an affiliate' },
                            { title: 'Merchandise', id: 'merch', description: 'Official merchandise' },
                            { title: 'Donate', id: 'donate', description: 'Support our work' },
                            { title: 'Volunteer', id: 'volunteer', description: 'Get involved' },
                            { title: 'Community', id: 'community', description: 'Join our community' },
                            { title: 'Forum', id: 'forum', description: 'Community discussions' },
                            { title: 'Beta Program', id: 'beta', description: 'Try beta features' }
                        ]
                    }
                ]
            })
            break
        case '!buttons':
            // Example: Send a text interactive message (modern Baileys format)
            await client.sendButtons(msg.from, {
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
            
            await client.sendButtons(msg.from, {
            imagePath: './example.jpg',
            caption: '', // Keep it short and concise
            title: '', // Max 24 chars
            subtitle: '', // Optional, appears below title
            footer: '', 
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
            
            `*🖼️ Media & Content*\n` +
            `• !media - Send an example image\n` +
            `• !doc - Send an example document\n` +
            `• !location - Send a location\n` +
            `• !contact - Send a contact card\n\n` +
            
            `*👥 Group Management*\n` +
            `• !groups - List all your groups\n` +
            `• !add <number> - Add participant\n` +
            `• !remove <number> - Remove participant\n` +
            `• !promote <number> - Make admin\n` +
            `• !demote <number> - Remove admin\n\n` +
            
            `*🎛️ Templates & Buttons*\n` +
            `• !buttons - Button template\n` +
            `• !list - Scrollable list\n\n` +
            
            `*⚙️ Admin Commands*\n` +
            `• !read - Mark as read\n` +
            `• !typing - Show typing\n` +
            `• !presence - Set status\n` +
            `• !logout - End session\n\n` +
            
            `*📝 Note*:\nReplace <number> with phone number\n(without + or spaces)`
            await client.sendMessage(msg.from, help)
            break

        case '!groups':
            try {
                const groups = await client.getAllGroups()
                if (groups && groups.length > 0) {
                    let groupList = '*Your Groups:*\n\n'
                    groups.forEach((group, index) => {
                        groupList += `${index + 1}. *${group.subject}*\n`
                        groupList += `   ID: ${group.id}\n`
                        groupList += `   Members: ${group.participants.length}\n`
                        if (group.desc) groupList += `   Description: ${group.desc}\n`
                        groupList += '\n'
                    })
                    await client.sendMessage(msg.from, groupList)
                } else {
                    await client.sendMessage(msg.from, 'You are not in any groups')
                }
            } catch (error) {
                console.error('Error fetching groups:', error)
                await client.sendMessage(msg.from, 'Failed to fetch groups')
            }
            break

        case '!logout':
            // Ask for confirmation before logging out
            await client.sendButtons(msg.from, {
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

            await client.sendMessage(msg.from, 'You have been logged out.');
            await client.logout();
            break;
        case 'No':
        case 'no':
        case 'logout_no':
            await client.sendMessage(msg.from, 'Logout cancelled.');
            break;

        case '!add':
        case '!remove':
        case '!promote':
        case '!demote':
            try {
                if (!msg.raw.key.remoteJid.endsWith('@g.us')) {
                    await client.sendMessage(msg.from, 'This command can only be used in groups')
                    break
                }

                const number = args.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
                if (!number) {
                    await client.sendMessage(msg.from, 'Please provide a valid phone number')
                    break
                }

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

                if (result[0].status === 200) {
                    await client.sendMessage(msg.from, `Successfully ${actionMap[action]} the group`)
                } else {
                    await client.sendMessage(msg.from, `Failed to ${action} participant: ${result[0].content}`)
                }
            } catch (error) {
                console.error(`Error ${command} participant:`, error)
                await client.sendMessage(msg.from, `Failed to ${command.slice(1)} participant`)
            }
            break
    }
})

// Listen for errors
client.on('error', error => {
    console.error('Client Error:', error)
})
