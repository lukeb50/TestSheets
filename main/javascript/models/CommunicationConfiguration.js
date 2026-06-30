class CommunicationConfiguration {
    dbKey = null;

    settings;
    schedule;
    notes;
    links;

    constructor(dbKey, { settings = {}, schedule = [], notes = [], links = [] } = {}) {
        this.dbKey = dbKey;
        this.settings = settings;
        this.schedule = schedule;
        this.notes = notes;
        this.links = links;
    }

    async markModified() {
        return;
    }

    static fromJson(jsonData, key) {
        return new CommunicationConfiguration(key, jsonData);
    }

    toJson() {
        return {
            key: this.dbKey,
            data: {
                settings: this.settings,
                schedule: this.schedule,
                notes: this.notes,
                links: this.links
            }
        }
    }
}