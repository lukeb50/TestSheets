class ConnectionManager {

    connection;

    constructor(connectionToUse) {
        this.connection = connectionToUse;
    }

    async getUserInformation() {
        return this.processCall(this.connection.getUserInformation());
    }

    async updateUserInformation(data) {
        return this.processCall(this.connection.updateUserInformation(data));
    }

    async saveSheetInstance(key, data) {
        return this.processCall(this.connection.saveSheetInstance(key, data));
    }

    async getSheetInstance(key) {
        return this.processCall(this.connection.getSheetInstance(key));
    }

    async getSheetSummary() {
        return this.processCall(this.connection.getSheetSummary());
    }

    async setSheetLabel(sheetKey, newLabel) {
        return this.processCall(this.connection.setSheetLabel(sheetKey, newLabel));
    }

    async deleteSheet(sheetKey) {
        return this.processCall(this.connection.deleteSheet(sheetKey));
    }

    async processCall(callPromise) {
        try {
            var response = await callPromise;
            return this.connection.processData(response);
        } catch (err) {
            //Perform any common handling here:
            console.warn(`Error during fetch with connector ${this.connection.constructor.name}`, err);
            throw err;
        }
    }
}

class BaseConnection {
    getUserInformation() {
        throw new Error("Must implement getUserInformation for connector");
    }

    updateUserInformation(data) {
        throw new Error("Must implement updateUserInformation for connector");
    }

    saveSheetInstance(key, data) {
        throw new Error("Must implement saveSheetInstance for connector");
    }

    getSheetInstance(key) {
        throw new Error("Must implement getSheetInstance for connector");
    }

    getSheetSummary() {
        throw new Error("Must implement getSheetSummary for connector");
    }

    setSheetLabel(sheetKey, newLabel) {
        throw new Error("Must implement setSheetLabel for connector");
    }

    deleteSheet(sheetKey) {
        throw new Error("Must implement deleteSheet for connector");
    }

    /**
     * Allows for any uniform transformation of the query response such as stripping unneeded fields before returning to requestor
     * @param {*} data the incoming data from the query
     **/
    processData(data) {
        throw new Error("Must implement processData for connector");
    }

    getUid() {
        return firebase.auth().currentUser.uid;
    }
}

class FirebaseFunctionsConnection extends BaseConnection {

    firebaseFn;

    constructor(firebaseFunctionsInstance) {
        super();
        this.firebaseFn = firebaseFunctionsInstance;
    }

    getUserInformation() {
        if (!this.getUid()) {
            return null;
        }
        return this.getFunctionRef("getUserInformation");
    }

    updateUserInformation(data) {
        if (!this.getUid()) {
            return null;
        }
        return this.getFunctionRef("updateUserInformation", data);
    }

    saveSheetInstance(key, data) {
        if (!this.getUid()) {
            return null;
        }
        return this.getFunctionRef("setSheetInstance", { key: key, data: data });
    }

    getSheetInstance(key) {
        if (!this.getUid()) {
            return null;
        }
        return this.getFunctionRef("getSheetInstance", key);
    }

    getSheetSummary() {
        if (!this.getUid()) {
            return null;
        }
        return this.getFunctionRef("getUserSheetSummary");
    }

    setSheetLabel(sheetKey, newLabel) {
        if (!this.getUid()) {
            return null;
        }
        return this.getFunctionRef("setSheetLabel", { key: sheetKey, label: newLabel });
    }

    deleteSheet(sheetKey) {
        if (!this.getUid()) {
            return null;
        }
        return this.getFunctionRef("deleteSheet", sheetKey);
    }

    /**
     * 
     * @param {*} fnName The name of the function to run
     * @param {*} params a key-value object of the parameters to send
     * @returns a promise representing the function run.
     */
    getFunctionRef(fnName, params) {
        return this.firebaseFn.httpsCallable(fnName)(params);
    }

    /**
     *@inheritdoc
     */
    processData(data) {
        //Trim redundant "data container field";
        return data.data;
    }
}