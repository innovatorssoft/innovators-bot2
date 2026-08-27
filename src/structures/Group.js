class Group {
    constructor(client, groupData) {
        this.client = client;
        this.id = groupData.id;
        this.notify = groupData.notify;
        this.subject = groupData.subject;
        this.creation = groupData.creation;
        this.owner = groupData.owner;
        this.desc = groupData.desc;
        this.participants = groupData.participants;
    }
}

module.exports = Group;
