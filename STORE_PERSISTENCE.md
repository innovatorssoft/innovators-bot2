## Message Store Persistence Commands

The following commands have been added to demonstrate the message store persistence functionality:

### !savestore
Manually saves the current message store to a JSON file.
- Creates/updates the file at the configured path (default: `{sessionName}/message-store.json`)
- Returns statistics about the save operation

**Usage:**
```
!savestore
```

**Example Response:**
```
✅ Store Saved Successfully

• Messages: 2547
• Path: auth_info_baileys/message-store.json
• Saved at: 2/17/2026, 11:15:30 AM
```

### !loadstore
Manually loads the message store from the saved JSON file.
- Clears current in-memory store
- Loads messages from the file
- Returns statistics about the load operation

**Usage:**
```
!loadstore
```

**Example Response:**
```
✅ Store Loaded Successfully

• Messages: 2547
• Loaded from: 2026-02-17T06:10:25.123Z
```

## Automatic Persistence

The message store automatically:
- **Loads** when the client connects
- **Saves** when the client disconnects
- **Auto-saves** every 5 minutes (configurable) if there are changes

## Configuration

Configure persistence in the client initialization:

```javascript
const client = new WhatsAppClient({
    sessionName: 'my-session',
    messageStoreFilePath: './data/my-session/message-store.json', // Optional
    autoSaveInterval: 5 * 60 * 1000, // 5 minutes (default)
    maxMessagesPerChat: 1000,
    messageTTL: 24 * 60 * 60 * 1000
});
```
