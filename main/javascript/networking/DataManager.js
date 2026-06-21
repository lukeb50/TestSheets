const SAVE_MODE = { LOCAL: "local", "SERVER": "server" };

class DataManager {

    connection;

    constructor(connection) {
        this.connection = connection;
    }

    async getUserInformation() {
        var storageVal = sessionStorage.getItem("userInformation");
        if (storageVal && storageVal !== "undefined") {
            return JSON.parse(storageVal);
        } else {
            var networkResultObj = await this.connection.getUserInformation();
            if (networkResultObj.getSaveStatus() === SAVE_STATUS.UNSAVED) {
                console.warn(networkResultObj.getError());
                throw networkResultObj.getError();
            }
            var userInfo = networkResultObj.getPayload()['userInformation'];
            sessionStorage.setItem("userInformation", JSON.stringify(userInfo));
            return userInfo;
        }
    }

    async #updateUserInformationInternal(newInformation) {
        var networkResultObj = await this.connection.updateUserInformation(newInformation);
        if (networkResultObj.getSaveStatus() === SAVE_STATUS.UNSAVED) {
            console.warn(networkResultObj.getError());
            throw networkResultObj.getError();
        }
        sessionStorage.setItem("userInformation", JSON.stringify(newInformation));
        return true;

    }

    //Updates the provided section of the user data.
    //Path array provides a path i.e. [settings,toolkitSettings] will update data in settings/toolkitSettings
    async updateUserInformation(path = [], data) {
        if (!path || !data) {
            throw new Error("Invalid parameters to updateUserInformation");
        }
        var baseData = await this.getUserInformation();
        var locPointer = baseData;
        for (let i = 0; i < path.length - 1; i++) {
            locPointer = locPointer[path[i]];
        }
        locPointer[path[path.length - 1]] = data;
        return this.#updateUserInformationInternal(baseData);
    }

    async saveSheetInstance(sheetInstance, saveMode = SAVE_MODE.SERVER) {
        //Conversions
        var jsonData = sheetInstance.toJson();
        //Request
        var networkResultObj = await this.connection.saveSheetInstance(saveMode, jsonData.key, jsonData.data);
        //Update sheet save status
        sheetInstance.setSaveStatus(networkResultObj.getSaveStatus());
        if (networkResultObj.getSaveStatus() !== SAVE_STATUS.UNSAVED) {
            //Save was made to some extent
            return networkResultObj.getPayload();
        }
        //Failed save (network & service worker)
        console.warn(networkResultObj.getError());
        throw networkResultObj.getError();
    }

    async getSheetInstance(sheetKey) {
        var networkResultObj = await this.connection.getSheetInstance(sheetKey);
        if (networkResultObj.getSaveStatus() !== SAVE_STATUS.UNSAVED) {
            return new SheetContainerBuilder().setJsonData(networkResultObj.getPayload()).setSaveStatus(networkResultObj.getSaveStatus()).setDbKey(sheetKey);
        }
        console.warn(networkResultObj.getError());
        throw networkResultObj.getError();
    }

    async getSheetSummary() {
        var networkResultObj = await this.connection.getSheetSummary();
        if (networkResultObj.getSaveStatus() !== SAVE_STATUS.UNSAVED) {
            return networkResultObj.getPayload();
        }
        console.warn(networkResultObj.getError());
        throw networkResultObj.getError();
    }

    async setSheetLabel(sheetDbKey, newLabel) {
        var networkResultObj = await this.connection.setSheetLabel(sheetDbKey, newLabel);
        if (networkResultObj.getSaveStatus() !== SAVE_STATUS.UNSAVED) {
            return true;
        }
        console.warn(networkResultObj.getError());
        throw networkResultObj.getError();
    }

    async deleteSheet(sheetDbKey) {
        var networkResultObj = await this.connection.deleteSheet(sheetDbKey);
        if (networkResultObj.getSaveStatus() !== SAVE_STATUS.UNSAVED) {
            return true;
        }
        console.warn(networkResultObj.getError());
        throw networkResultObj.getError();
    }

    async saveToolkitInstance(toolkitEntry, attachedSheetEntry, saveMode = SAVE_MODE.SERVER) {
        var jsonData = toolkitEntry.toJson();
        //Request
        var networkResultObj = await this.connection.saveToolkitInstance(saveMode, jsonData.key, jsonData.attachedSheetKey, jsonData.data);
        if (networkResultObj.getSaveStatus() === SAVE_STATUS.UNSAVED) {
            console.warn(networkResultObj.getError());
            throw networkResultObj.getError();
        }
        //Update save status of both (as the sheet tracks all toolkits)
        toolkitEntry.setSaveStatus(networkResultObj.getSaveStatus());
        attachedSheetEntry.setSaveStatus(networkResultObj.getSaveStatus());
        //Perform updates to local values to mirror server
        let key = networkResultObj.getPayload();
        if (key) {
            //Update the sheet toolkitMapping
            if (!attachedSheetEntry.toolkitMapping[toolkitEntry.skillId]) {
                attachedSheetEntry.toolkitMapping[toolkitEntry.skillId] = [];
            }
            if (!attachedSheetEntry.toolkitMapping[toolkitEntry.skillId].find((mapEntry) => mapEntry.id === key)) {
                //This is a new create, add it into the mapping file
                attachedSheetEntry.toolkitMapping[toolkitEntry.skillId].push({ id: key, candidates: getCandidatesInfo() });
            } else {
                //This is an update, update the candidates in the mapping file
                attachedSheetEntry.toolkitMapping[toolkitEntry.skillId].find((mapEntry) => mapEntry.id === key).candidates = getCandidatesInfo();
            }
            attachedSheetEntry.markToolkitModified();
            //Sync the changes to the mapping to the local database
            this.connection.syncSheetToLocal(jsonData.attachedSheetKey, attachedSheetEntry.toJson());
            //Return the key as a success indicator
            return key;
        }
        throw new Error("Server rejected");

        function getCandidatesInfo() {
            return toolkitEntry.teams.map((team) => team.individuals.map((individual) => ({ id: individual.responseId, result: individual.result })));
        }
    }

    async getToolkitInstance(toolkitKey, attachedSheetContainer) {
        var networkResultObj = await this.connection.getToolkitInstance(toolkitKey, attachedSheetContainer.dbKey);
        if (networkResultObj.getSaveStatus() === SAVE_STATUS.UNSAVED) {
            console.warn(networkResultObj.getError());
            throw networkResultObj.getError();
        }
        var toolkitResult = SkillMarkingEntry.fromJson(networkResultObj.getPayload(),
            toolkitKey, attachedSheetContainer.dbKey);
        toolkitResult.setSaveStatus(networkResultObj.getSaveStatus());
        return toolkitResult;
    }

    async deleteToolkitInstance(toolkitKey, attachedSheetEntry, skillId) {
        //Save
        var networkResultObj = await this.connection.deleteToolkitInstance(toolkitKey, attachedSheetEntry.dbKey);
        console.log(networkResultObj);
        if (networkResultObj.getSaveStatus() === SAVE_STATUS.UNSAVED) {
            console.warn(networkResultObj.getError());
            throw networkResultObj.getError();
        }
        attachedSheetEntry.setSaveStatus(networkResultObj.getSaveStatus());
        //Remove from sheet listing
        let skillMapping = attachedSheetEntry.toolkitMapping[skillId];
        skillMapping.splice(skillMapping.findIndex((mapEntry) => mapEntry.id === toolkitKey), 1);
        this.connection.syncSheetToLocal(attachedSheetEntry.dbKey, attachedSheetEntry.toJson());
        return true;
    }

    async queryToolkitResults(attachedSheetKey, queryType, queryValue, queryExclusions) {
        var networkResultObj = await this.connection.queryToolkitResults(attachedSheetKey, queryType, queryValue, queryExclusions);
        if (networkResultObj.getSaveStatus() === SAVE_STATUS.UNSAVED) {
            console.warn(networkResultObj.getError());
            throw networkResultObj.getError();
        }
        var toolkitRawResult = networkResultObj.getPayload();
        var toolkitResult = {};
        for (const [id, valueRaw] of Object.entries(toolkitRawResult.sheets)) {
            toolkitResult[id] = SkillMarkingEntry.fromJson(valueRaw, id, attachedSheetKey);
        }
        return { sheets: toolkitResult, relevantIds: toolkitRawResult.relevantIds, networkStatus: networkResultObj.getSaveStatus() };
    }

    async getCommunicationRegistration(sheetId) {
        var networkResultObj = await this.connection.getCommunicationRegistration(sheetId);
        if (networkResultObj.getSaveStatus() === SAVE_STATUS.UNSAVED) {
            console.warn(networkResultObj.getError());
            throw networkResultObj.getError();
        }
        return networkResultObj.getPayload();
    }

    async createCommunicationRegistration(sheetId) {
        var networkResultObj = await this.connection.createCommunicationRegistration(sheetId);
        if (networkResultObj.getSaveStatus() === SAVE_STATUS.UNSAVED) {
            console.warn(networkResultObj.getError());
            throw networkResultObj.getError();
        }
        return networkResultObj.getPayload();
    }

    async getCommunicationRegisteredCandidates(sheetId) {
        var networkResultObj = await this.connection.getCommunicationCandidates(sheetId);
        if (networkResultObj.getSaveStatus() === SAVE_STATUS.UNSAVED) {
            console.warn(networkResultObj.getError());
            throw networkResultObj.getError();
        }
        return networkResultObj.getPayload();
    }
}