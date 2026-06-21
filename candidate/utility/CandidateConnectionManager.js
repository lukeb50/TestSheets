class ConnectionManager {

    connection;

    constructor(connectionToUse) {
        this.connection = connectionToUse;
    }

    async getCommunicationCandidateView(registration) {
        let info = new DatabaseExecutionObject("get", "communicationregistration", null, "candidateview", registration);
        return this.processCall(info);
    }

    async processCall(executionObj) {
        return new Promise((resolve, reject) => {
            var networkPromise = this.connection.execute(executionObj).then((resultObj) => {
                if (!resultObj.isSuccess()) {//The server responded with a 4xx of 5xx
                    reject(new OperationPublicResult(null, resultObj.error, SAVE_STATUS.UNSAVED));
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