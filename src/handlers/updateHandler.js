const {
    createAntiDeleteHandler,
    getAggregateVotesInPollMessage
} = require('@innovatorssoft/baileys');

/**
 * Handle messages.update event (Anti-Delete and Poll Updates)
 * @param {object} client - The WhatsAppClient instance
 * @param {Array<object>} updates - Array of message updates
 */
async function handleMessagesUpdate(client, updates) {
    // 🛡️ Anti-Delete System: Handle message revokes/deletions
    const antiDeleteHandler = createAntiDeleteHandler(client.messageStore);
    const deletedMessages = antiDeleteHandler(updates);

    for (const info of deletedMessages) {
        let jid = client._normalizeJid(info.key.remoteJid);
        // Use original remoteJid for technical identification
        const jidAlt = client._normalizeJid(info.key.remoteJidAlt) || null;

        client.emit('message-deleted', {
            jid: jid,
            jidAlt: jidAlt,
            originalMessage: info.originalMessage,
            key: info.key
        });
    }

    // Handle Poll Updates
    for (const updateObj of updates) {
        const { key, update } = updateObj;
        if (update.pollUpdates) {
            try {
                const pollCreation = client.messageStore.getOriginalMessage(key);
                if (pollCreation) {
                    // Initialize pollUpdates array on the stored message if it doesn't exist
                    if (!pollCreation.pollUpdates) {
                        pollCreation.pollUpdates = [];
                    }

                    // Merge new updates by voter JID to ensure only the latest vote per voter is stored
                    for (const newUp of update.pollUpdates) {
                        const voterJid = newUp.pollUpdateMessageKey?.participant || (newUp.pollUpdateMessageKey?.fromMe ? 'me' : null);
                        if (voterJid) {
                            const normVoterJid = voterJid === 'me' ? 'me' : client._normalizeJid(voterJid);
                            const index = pollCreation.pollUpdates.findIndex(existing => {
                                const existingVoter = existing.pollUpdateMessageKey?.participant || (existing.pollUpdateMessageKey?.fromMe ? 'me' : null);
                                const normExisting = existingVoter === 'me' ? 'me' : client._normalizeJid(existingVoter);
                                return normExisting === normVoterJid;
                            });
                            if (index !== -1) {
                                pollCreation.pollUpdates[index] = newUp; // Replace with latest vote update from this voter
                            } else {
                                pollCreation.pollUpdates.push(newUp); // Add new voter's update
                            }
                        }
                    }

                    const pollUpdate = getAggregateVotesInPollMessage({
                        message: pollCreation.message || pollCreation,
                        pollUpdates: pollCreation.pollUpdates,
                    });

                    // Resolve JID from LID to PN for voters in the poll update
                    const resolvedPollUpdate = await Promise.all(
                        pollUpdate.map(async (option) => {
                            const resolvedVoters = await Promise.all(
                                (option.voters || []).map(async (v) => {
                                    if (v === 'me') return 'me';
                                    return await client._resolveLidToPn(v);
                                })
                            );
                            return {
                                ...option,
                                voters: resolvedVoters
                            };
                        })
                    );

                    let jid = client._normalizeJid(key.remoteJid);
                    jid = await client._resolveLidToPn(jid);
                    const jidAlt = client._normalizeJid(key.remoteJidAlt) || null;

                    // Clone key to resolve LIDs to PNs without mutating the original reference if it's read-only
                    const resolvedKey = { ...key };
                    if (key.remoteJid) {
                        resolvedKey.remoteJid = await client._resolveLidToPn(key.remoteJid);
                    }
                    if (key.participant) {
                        resolvedKey.participant = await client._resolveLidToPn(key.participant);
                    }

                    // Clone pollCreation to resolve LIDs to PNs without mutating the original store reference
                    const resolvedPollCreation = { ...pollCreation };
                    if (pollCreation.participant) {
                        resolvedPollCreation.participant = await client._resolveLidToPn(pollCreation.participant);
                    }
                    if (pollCreation.key) {
                        resolvedPollCreation.key = { ...pollCreation.key };
                        if (pollCreation.key.remoteJid) {
                            resolvedPollCreation.key.remoteJid = await client._resolveLidToPn(pollCreation.key.remoteJid);
                        }
                        if (pollCreation.key.participant) {
                            resolvedPollCreation.key.participant = await client._resolveLidToPn(pollCreation.key.participant);
                        }
                    }

                    // Extract and resolve voter JID(s) from the pollUpdates
                    const voters = await Promise.all(
                        (update.pollUpdates || []).map(async (u) => {
                            const voterJid = u.pollUpdateMessageKey?.participant || (u.pollUpdateMessageKey?.fromMe ? 'me' : null);
                            if (voterJid && voterJid !== 'me') {
                                return await client._resolveLidToPn(client._normalizeJid(voterJid));
                            }
                            return voterJid;
                        })
                    ).then(arr => arr.filter(Boolean));

                    client.emit('poll-votes-update', {
                        jid: jid,
                        jidAlt: jidAlt,
                        voter: voters[0] || null,
                        voters: voters,
                        key: resolvedKey,
                        pollUpdate: resolvedPollUpdate,
                        pollCreationMessage: resolvedPollCreation
                    });
                } else {
                    console.log('[PollVotes] Could not find poll creation message in store for key:', key.id);
                }
            } catch (err) {
                console.error('[PollVotes ERROR] Error processing poll updates:', err);
            }
        }
    }
}

module.exports = {
    handleMessagesUpdate
};
