class DataManager {

    connectionManager;

    constructor(connection) {
        this.connectionManager = connection;
    }

    async getUserInformation() {
        var storageVal = sessionStorage.getItem("userInformation");
        if (storageVal) {
            return JSON.parse(storageVal);
        } else {
            try {
                var valuesObj = await this.connectionManager.getUserInformation();
                if (!valuesObj) {
                    return null;
                }
                var userInfo = valuesObj['userInformation'];
                sessionStorage.setItem("userInformation", JSON.stringify(userInfo));
                return userInfo;
            } catch (err) {
                console.warn(err);
                throw err;
            }
        }
    }

    async updateUserInformation(newInformation) {
        try {
            var success = await this.connectionManager.updateUserInformation(newInformation);
            if (!success) {
                return false;
            }
            sessionStorage.setItem("userInformation", newInformation);
            return true;
        } catch (err) {
            console.warn(err);
            throw err;
        }
    }

    async saveSheetInstance(responseObj) {
        try {
            responseObj.modifiedAt = Date.now();
            var jsonData = responseObj.toJson();
            var key = await this.connectionManager.saveSheetInstance(jsonData.key, jsonData.data);
            if (key) {
                responseObj.dbKey = key;
                return key;
            }
            return null;
        } catch (err) {
            console.warn(err);
            throw err;
        }
    }

    async getSheetInstance(sheetKey) {
        try {
            var sheetResult = await this.connectionManager.getSheetInstance(sheetKey);
            return sheetResult;
        } catch (err) {
            console.warn(err);
            throw err;
        }
    }

    async getSheetSummary() {
        try {
            var summaryResults = await this.connectionManager.getSheetSummary();
            return summaryResults;
        } catch (err) {
            console.warn(err);
            throw err;
        }
    }

    async setSheetLabel(sheetKey, newLabel) {
        try {
            await this.connectionManager.setSheetLabel(sheetKey, newLabel);
            return true;
        } catch (err) {
            console.warn(err);
            throw err;
        }
    }

    async deleteSheet(sheetKey) {
        try {
            await this.connectionManager.deleteSheet(sheetKey);
            return true;
        } catch (err) {
            console.warn(err);
            throw err;
        }
    }
}