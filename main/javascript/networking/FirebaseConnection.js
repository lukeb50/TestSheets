class FirebaseFunctionsConnection extends BaseConnection {
    firebaseFn;

    constructor(firebaseFunctionsInstance) {
        super();
        this.firebaseFn = firebaseFunctionsInstance;
    }

    async execute(databaseExecutionObj) {
        //if (!this.getUid()) {
            //return null;
        //}
        try {
            var result = await this.getFunctionRef(`${databaseExecutionObj.getMethod()}${databaseExecutionObj.getObjectType()}${databaseExecutionObj.getExtraAction()}`, databaseExecutionObj.getRequestBody());
            //Callable functions resolves all calls as 200 codes and packages the actual response.
            //Unpackage and send back, similar to fetch() behaviour
            let code = result.data.code;
            let message = result.data.message;
            if (code < 300) {//success codes
                message = JSON.parse(message);
                return new OperationInternalResult(code, message, null);
            } else {
                return new OperationInternalResult(code, null, message);
            }
        } catch (err) {//Network errors only
            throw err;
        }
    }

    /**
     * 
     * @param {*} fnName The name of the function to run
     * @param {*} params a key-value object of the parameters to send
     * @returns a promise representing the function run.
     */
    async getFunctionRef(fnName, params) {
        return this.firebaseFn.httpsCallable(fnName)(params);
    }
}