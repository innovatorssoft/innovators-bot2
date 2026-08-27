/**
 * Handle groups.upsert event
 * @param {object} client - The WhatsAppClient instance
 * @param {Array<object>} groups - Array of group objects
 */
function handleGroupsUpsert(client, groups) {
    for (const group of groups) {
        client.updateGroupMetadataCache(group.id, group);
    }
}

/**
 * Handle groups.update event
 * @param {object} client - The WhatsAppClient instance
 * @param {Array<object>} groups - Array of group update objects
 */
function handleGroupsUpdate(client, groups) {
    for (const group of groups) {
        const cached = client.groupMetadataCache.get(group.id);
        if (cached) {
            const updated = { ...cached, ...group };
            client.updateGroupMetadataCache(group.id, updated);
        }
    }
}

/**
 * Handle group-participants.update event
 * @param {object} client - The WhatsAppClient instance
 * @param {object} update - Participant update object { id, participants, action }
 */
async function handleGroupParticipantsUpdate(client, update) {
    try {
        const metadata = await client.sock.groupMetadata(update.id);
        client.updateGroupMetadataCache(update.id, metadata);
    } catch (error) {
        const isNotFound = error.data === 404 ||
            error.message?.includes('item-not-found') ||
            error.output?.statusCode === 404;

        if (isNotFound) {
            client.clearGroupMetadataCache(update.id);
            client.emit('group-left', {
                id: update.id,
                reason: 'Group not found or bot was removed'
            });
        } else {
            console.error(`Error refreshing metadata for group ${update.id}:`, error);
        }
    }
}

module.exports = {
    handleGroupsUpsert,
    handleGroupsUpdate,
    handleGroupParticipantsUpdate
};
