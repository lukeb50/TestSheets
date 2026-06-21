class DatabaseExecutionObject {
    method;
    extraAction;
    objectType;
    objectKey;
    requestBody;

    constructor(method, objectType, objectKey, extraAction, requestBody) {
        this.method = method;
        this.extraAction = extraAction ?? "";
        this.objectType = objectType;
        this.objectKey = objectKey;
        this.requestBody = requestBody;
    }

    static fromJson({ method, objectType, objectKey, extraAction, requestBody } = {}) {
        return new DatabaseExecutionObject(method, objectType, objectKey, extraAction, requestBody);
    }

    static fromOther(otherExecutionObj) {
        return new DatabaseExecutionObject(otherExecutionObj.getMethod(),
            otherExecutionObj.getObjectType(),
            otherExecutionObj.getObjectKey(),
            otherExecutionObj.getExtraAction(),
            otherExecutionObj.getRequestBody()
        )
    }

    getMethod() {
        return this.method;
    }

    getObjectType() {
        return this.objectType;
    }

    getObjectKey() {
        return this.objectKey;
    }

    getExtraAction() {
        return this.extraAction;
    }

    getRequestBody() {
        return this.requestBody;
    }

    setNetworkResult(netResult) {
        this.networkResult = netResult;
        return this;
    }
}

class OperationPublicResult {
    payload;
    saveStatus;
    error;
    constructor(payload = null, error = null, saveStatus) {
        this.payload = payload;
        this.saveStatus = saveStatus;
        this.error = error;
    }

    getPayload() {
        return this.payload;
    }

    getError() {
        return this.error;
    }

    getSaveStatus() {
        return this.saveStatus;
    }
}

class OperationInternalResult {
    payload;
    error;
    statusCode;
    constructor(statusCode, payload, error) {
        this.statusCode = statusCode;
        this.payload = payload;
        this.error = error;
    }

    isSuccess() {
        return this.statusCode < 300;
    }
}

class BaseConnection {
    async execute(databaseExecutionObj) {
        throw new Error("Must implement execute for connector");
    }

    getUid() {
        return firebase.auth()?.currentUser?.uid ?? null;
    }
}