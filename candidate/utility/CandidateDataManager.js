class DataManager {

    connection;

    constructor(connection) {
        this.connection = connection;
    }

    async getCommunicationCandidateView(registration) {
        var networkResultObj = await this.connection.getCommunicationCandidateView(registration);
        if (networkResultObj.getSaveStatus() === SAVE_STATUS.UNSAVED) {
            console.warn(networkResultObj.getError());
            throw networkResultObj.getError();
        }
        return networkResultObj.getPayload();
    }
}