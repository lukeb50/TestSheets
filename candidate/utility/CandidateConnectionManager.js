class ConnectionManager {

    connection;

    constructor(connectionToUse) {
        this.connection = connectionToUse;
    }

    async getEntryToken(registration, dataType, dataValue) {
        let info = new DatabaseExecutionObject("get", "candidateregistration", null, "getentrytoken", { registrationId: registration, dataType: dataType, dataValue: dataValue });
        return this.processCall(info);
    }

    async getCandidateToken(registration, entryToken) {
        let info = new DatabaseExecutionObject("get", "candidateregistration", null, "register", { registrationId: registration, entryToken: entryToken });
        return this.processCall(info);
    }

    async getCandidateTokenWithBypass(registration, bypassKey) {
        let info = new DatabaseExecutionObject("get", "candidateregistration", null, "register", { registrationId: registration, bypassCode: bypassKey });
        return this.processCall(info);
    }

    async revokeCandidateToken(token) {
        let info = new DatabaseExecutionObject("get", "candidateregistration", null, "revoke", { token: token });
        return this.processCall(info);
    }

    async getCandidateConfiguration(token) {
        let info = new DatabaseExecutionObject("get", "candidateregistration", null, "configuration", { token: token });
        return this.processCall(info);
    }

    async processCall(executionObj) {
        return new Promise((resolve, reject) => {
            var networkPromise = this.connection.execute(executionObj).then((resultObj) => {
                if (!resultObj.isSuccess()) {//The server responded with a 4xx of 5xx
                    resolve(new OperationPublicResult(null, resultObj.error, SAVE_STATUS.UNSAVED));
                    return;
                }
                //The server returned 2xx or 3xx, Let UI know save succeeded
                resolve(new OperationPublicResult(resultObj.payload, null, SAVE_STATUS.SERVER_SAVED));
            }).catch((err) => {
                reject(new OperationPublicResult(null, err, SAVE_STATUS.UNSAVED));
            });
        });
    }
}