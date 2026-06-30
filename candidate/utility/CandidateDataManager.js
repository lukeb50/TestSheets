class DataManager {

    connection;

    constructor(connection) {
        this.connection = connection;
    }

    async getEntryToken(registration, dataType, dataValue) {
        var networkResultObj = await this.connection.getEntryToken(registration, dataType, dataValue);
        if (networkResultObj.getSaveStatus() === SAVE_STATUS.UNSAVED) {
            throw new Error(networkResultObj.getError());//Pass through the error code so that the client can display
        }
        return networkResultObj.getPayload();
    }

    async getCandidateToken(registration, entryToken) {
        var networkResultObj = await this.connection.getCandidateToken(registration, entryToken);
        if (networkResultObj.getSaveStatus() === SAVE_STATUS.UNSAVED) {
            console.warn(networkResultObj.getError());
            throw networkResultObj.getError();
        }
        return networkResultObj.getPayload();
    }

    async getCandidateTokenWithBypass(registration, bypassKey) {
        var networkResultObj = await this.connection.getCandidateTokenWithBypass(registration, bypassKey);
        if (networkResultObj.getSaveStatus() === SAVE_STATUS.UNSAVED) {
            console.warn(networkResultObj.getError());
            throw networkResultObj.getError();
        }
        return networkResultObj.getPayload();
    }

    async revokeCandidateToken(token) {
        var networkResultObj = await this.connection.revokeCandidateToken(token);
        if (networkResultObj.getSaveStatus() === SAVE_STATUS.UNSAVED) {
            console.warn(networkResultObj.getError());
            throw networkResultObj.getError();
        }
        return networkResultObj.getPayload();
    }

    async getCandidateConfiguration(token) {
        var networkResultObj = await this.connection.getCandidateConfiguration(token);
        if (networkResultObj.getSaveStatus() === SAVE_STATUS.UNSAVED) {
            console.warn(networkResultObj.getError());
            throw networkResultObj.getError();
        }
        if (networkResultObj.getPayload()) {
            return new CommunicationConfiguration(token.registrationId, networkResultObj.getPayload());
        } else {
            return new CommunicationConfiguration(token.registrationId);
        }
    }
}