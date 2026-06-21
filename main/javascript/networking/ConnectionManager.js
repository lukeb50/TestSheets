class ConnectionManager {

    connection;

    constructor(connectionToUse) {
        this.connection = connectionToUse;
    }

    async getUserInformation() {
        let info = new DatabaseExecutionObject("get", "user", null, null, {});
        return this.processCall(info);
    }

    async updateUserInformation(data) {
        let info = new DatabaseExecutionObject("save", "user", null, null, data);
        return this.processCall(info);
    }

    async saveSheetInstance(saveMode, key, data) {
        let info = new DatabaseExecutionObject("save", "sheet", key, null, { key: key, data: data });
        if (saveMode === SAVE_MODE.SERVER) {
            return this.processCall(info);
        } else {
            return this.processAutosave(info);
        }
    }

    async getSheetInstance(key) {
        let info = new DatabaseExecutionObject("get", "sheet", key, null, key);
        return this.processCall(info);
    }

    async getSheetSummary() {
        let info = new DatabaseExecutionObject("query", "sheet", null, "summary", {})
        return new Promise((resolve, reject) => {
            this.processCall(info).then(async (returnedData) => {
                resolve(returnedData);
                if (returnedData.getSaveStatus() === SAVE_STATUS.SERVER_SAVED && navigator.serviceWorker?.controller !== null) {
                    //Remove dead entries from the database
                    const localDbConnection = new LocalDatabaseConnection(SERVICE_WORKER_NETWORK_RESULT.SUCCESS);
                    let localResult = await localDbConnection.execute(info);
                    //Get the locally saved & server sheet keys
                    let serverKeys = Object.keys(returnedData.payload)
                    let localKeys = Object.keys(localResult);
                    //Calculate any stale keys
                    var keysToRemove = localKeys.filter((key) => !serverKeys.includes(key));
                    keysToRemove.forEach(async (key) => {
                        //For each, load the full sheet from indexedDb
                        let localSheet = await localDbConnection.execute(new DatabaseExecutionObject("get", "sheet", key, null, key));
                        //Find all toolkit ids associated
                        let attachedToolkitIds = Object.values(localSheet.toolkitMapping ?? {}).flat().map((entry) => entry.id);
                        //Delete them
                        attachedToolkitIds.forEach((toolkitId) => {
                            let toolkitDeleteRequest = new DatabaseExecutionObject("delete", "toolkit", ConnectionManager.createToolkitCompositeKey(toolkitId, key), null, { attachedSheetKey: key, key: toolkitId });
                            localDbConnection.execute(toolkitDeleteRequest);
                        });
                        //Delete the sheet
                        localDbConnection.execute(new DatabaseExecutionObject("delete", "sheet", key, null, key));
                    })
                }
            }).catch((err) => {
                reject(err);
            })
        })
    }

    async setSheetLabel(sheetKey, newLabel) {
        let info = new DatabaseExecutionObject("update", "sheet", sheetKey, "label", { key: sheetKey, label: newLabel });
        return this.processCall(info);
    }

    async deleteSheet(sheetKey) {
        let info = new DatabaseExecutionObject("delete", "sheet", sheetKey, null, sheetKey);
        return this.processCall(info);
    }

    async saveToolkitInstance(saveMode, toolkitKey, attachedSheetKey, toolkitEntry) {
        let info = new DatabaseExecutionObject("save", "toolkit", ConnectionManager.createToolkitCompositeKey(toolkitKey, attachedSheetKey), null, { attachedSheetKey: attachedSheetKey, key: toolkitKey, data: toolkitEntry });
        if (saveMode === SAVE_MODE.SERVER) {
            return this.processCall(info);
        } else {
            return this.processAutosave(info);
        }
    }

    async getToolkitInstance(toolkitKey, attachedSheetKey) {
        let info = new DatabaseExecutionObject("get", "toolkit", ConnectionManager.createToolkitCompositeKey(toolkitKey, attachedSheetKey), null, { attachedSheetKey: attachedSheetKey, key: toolkitKey });
        return this.processCall(info);
    }

    async deleteToolkitInstance(toolkitKey, attachedSheetKey) {
        let info = new DatabaseExecutionObject("delete", "toolkit", ConnectionManager.createToolkitCompositeKey(toolkitKey, attachedSheetKey), null, { attachedSheetKey: attachedSheetKey, key: toolkitKey });
        return this.processCall(info);
    }

    async queryToolkitResults(attachedSheetKey, queryType, queryValue, queryExclusions) {
        let info = new DatabaseExecutionObject("query", "toolkit", attachedSheetKey, "results", { attachedSheetKey: attachedSheetKey, queryType: queryType, queryValue: queryValue, queryExclusions: queryExclusions });
        return this.processCall(info);
    }

    async syncSheetToLocal(key, data) {
        let info = new DatabaseExecutionObject("internal_put", "sheet", key, null, data);
        try {
            let result = new LocalDatabaseConnection(SERVICE_WORKER_NETWORK_RESULT.PASSTHROUGH).execute(info);
            return new OperationPublicResult(result, null, SAVE_STATUS.LOCAL_SAVED);
        } catch (err) {
            return new OperationPublicResult(null, err, SAVE_STATUS.UNSAVED);
        }
    }

    static createToolkitCompositeKey(toolkitKey, attachedSheetKey) {
        return [attachedSheetKey, toolkitKey];
    }

    async getCommunicationRegistration(sheetKey) {
        let info = new DatabaseExecutionObject("get", "communicationregistration", null, null, sheetKey);
        return this.processCall(info);
    }

    async createCommunicationRegistration(sheetKey) {
        let info = new DatabaseExecutionObject("get", "communicationregistration", null, "create", sheetKey);
        return this.processCall(info);
    }

    async getCommunicationCandidates(sheetKey) {
        let info = new DatabaseExecutionObject("get", "communicationregistration", null, "candidates", sheetKey);
        return this.processCall(info);
    }

    //Process a call to the server with local fallback
    async processCall(executionObj) {
        if (executionObj.method === "get") {
            return this.processGetCall(executionObj);
        }
        if (executionObj.method === "delete") {
            return this.processDeleteCall(executionObj);
        }
        return new Promise((resolve, reject) => {
            this.connection.execute(executionObj).then((resultObj) => {
                if (!resultObj.isSuccess()) {//The server responded with a 4xx of 5xx
                    reject(new OperationPublicResult(null, resultObj.error, SAVE_STATUS.UNSAVED));
                    return;
                }
                //The server returned 2xx or 3xx, Let UI know save succeeded
                resolve(new OperationPublicResult(resultObj.payload, null, SAVE_STATUS.SERVER_SAVED));
                try {
                    //Mirror to service worker
                    let localExecutionObj = DatabaseExecutionObject.fromOther(executionObj);
                    localExecutionObj.setNetworkResult(resultObj);
                    new LocalDatabaseConnection(SERVICE_WORKER_NETWORK_RESULT.SUCCESS).execute(localExecutionObj);
                } catch (err) {
                    //Could not contact service worker
                    console.log(err);
                }
            }).catch((err) => {
                //Network failure, use the service worker and mark it for propagation to the server later
                new LocalDatabaseConnection(SERVICE_WORKER_NETWORK_RESULT.FAILED).execute(executionObj).then((result) => {
                    resolve(new OperationPublicResult(result, null, SAVE_STATUS.LOCAL_SAVED));
                }).catch((err) => {
                    //Could not local save, can't contact service worker
                    reject(new OperationPublicResult(null, err, SAVE_STATUS.UNSAVED));
                })
            })
        })
    }

    async processAutosave(executionObj) {
        if (executionObj.method !== "save") {
            throw new Error("Invalid execution object (not save method)");
        }
        try {
            let result = await new LocalDatabaseConnection(SERVICE_WORKER_NETWORK_RESULT.AUTOSYNC).execute(executionObj);
            return new OperationPublicResult(result, null, SAVE_STATUS.LOCAL_SAVED);
        } catch (err) {
            console.log(err);
            return new OperationPublicResult(null, err, SAVE_STATUS.UNSAVED);
        }
    }

    processGetCall(executionObj) {
        const connectivityBroadcastChannel = new BroadcastChannel('TEST_SHEETS/SW_CONNECTIVITY');
        if (executionObj.method !== "get") {
            throw new Error("Invalid execution object (not get method)");
        }
        return new Promise((resolve, reject) => {
            var networkPromise = this.connection.execute(executionObj);
            var localDbPromise = new LocalDatabaseConnection(SERVICE_WORKER_NETWORK_RESULT.PASSTHROUGH).execute(executionObj);
            Promise.allSettled([networkPromise, localDbPromise]).then((promiseValues) => {
                let networkResultValue = promiseValues[0];
                let isNetworkSuccess = networkResultValue.status === "fulfilled" && networkResultValue.value.isSuccess();
                let localDbResultValue = promiseValues[1];
                let isLocalDbSuccess = localDbResultValue.status === "fulfilled" && localDbResultValue.value !== undefined;
                if (isNetworkSuccess === false && isLocalDbSuccess === false) {
                    //Double fail, no result available
                    connectivityBroadcastChannel.postMessage(SERVICE_WORKER_CONNECTIVITY.OFFLINE);
                    console.log("Network and SW Fail")
                    reject(new OperationPublicResult(null, networkResultValue.reason, SAVE_STATUS.UNSAVED));
                } else if (isNetworkSuccess === true && isLocalDbSuccess === false) {
                    //network only
                    connectivityBroadcastChannel.postMessage(SERVICE_WORKER_CONNECTIVITY.ONLINE);
                    console.log("Network Only")
                    resolve(new OperationPublicResult(networkResultValue.value.payload, null, SAVE_STATUS.SERVER_SAVED));
                    console.log(networkResultValue)
                    this.syncGetResultToLocal(executionObj, networkResultValue.value.payload);
                } else if (isNetworkSuccess === false && isLocalDbSuccess === true) {
                    //Local only
                    connectivityBroadcastChannel.postMessage(SERVICE_WORKER_CONNECTIVITY.OFFLINE);
                    console.log("Local Only")
                    resolve(new OperationPublicResult(localDbResultValue.value, null, SAVE_STATUS.LOCAL_SAVED));
                } else {
                    connectivityBroadcastChannel.postMessage(SERVICE_WORKER_CONNECTIVITY.ONLINE);
                    //both, decide which value to return
                    if (networkResultValue.value?.payload?.modifiedAt && localDbResultValue?.value?.modifiedAt) {
                        console.log("Both With ModifiedAt Payload")
                        let networkModifiedAt = networkResultValue.value.payload.modifiedAt;
                        let localModifiedAt = localDbResultValue.value.modifiedAt;
                        let isNetworkChosen = networkModifiedAt >= localModifiedAt;
                        console.log("Is Network?" + isNetworkChosen, networkModifiedAt, localModifiedAt)
                        let selectedResult = isNetworkChosen ? networkResultValue.value.payload : localDbResultValue.value;
                        resolve(new OperationPublicResult(selectedResult, null, isNetworkChosen ? SAVE_STATUS.SERVER_SAVED : SAVE_STATUS.LOCAL_SAVED));
                        if (isNetworkChosen) {
                            //Save to local db
                            this.syncGetResultToLocal(executionObj, selectedResult);
                        } else {
                            //A more recent version came from localDB, sync it back to the server
                        }
                    } else {
                        //Does not have modifiedAt value, default to server
                        console.log("No modifiedAt, default to server");
                        resolve(new OperationPublicResult(networkResultValue.value.payload, null, SAVE_STATUS.SERVER_SAVED));
                    }
                }
            })
        });
    }

    processDeleteCall(executionObj) {
        return new Promise(async (resolve, reject) => {
            try {
                //Network attempt
                let result = await this.connection.execute(executionObj);
                if (result.isSuccess()) {
                    resolve(new OperationPublicResult(result.payload, null, SAVE_STATUS.SERVER_SAVED));
                    //DO NOT RETURN HERE. A successful network call is to be passed through below
                } else if (result.statusCode !== 404) {
                    //Server returned but rejected
                    reject(new OperationPublicResult(null, result.errorCode, SAVE_STATUS.UNSAVED));
                    //Stop
                    return;
                }
                //Server returned a success or a 404, ask the service worker to delete local recods
                new LocalDatabaseConnection(SERVICE_WORKER_NETWORK_RESULT.PASSTHROUGH).execute(executionObj).then((res) => {
                    console.log(res);
                    resolve(new OperationPublicResult(res, null, SAVE_STATUS.SERVER_SAVED));//Return to manager that this was a server success delete
                }).catch((swErr) => {//SW Failure
                    console.log(swErr)
                    //Reject. If this was a server success, the reject call will be ignored, if a server fail, this is the first resolution and will propagate.
                    reject(new OperationPublicResult(null, swErr, SAVE_STATUS.UNSAVED));
                })
            } catch (err) {
                console.log(err);
                //Network failure, attempt SW with replay enabled
                new LocalDatabaseConnection(SERVICE_WORKER_NETWORK_RESULT.FAILED).execute(executionObj).then((res) => {
                    resolve(new OperationPublicResult(res, null, SAVE_STATUS.LOCAL_SAVED));//Return to manager that this was a local only delete
                }).catch((swErr) => {
                    //Double failure, operation failed
                    console.log(swErr)
                    reject(new OperationPublicResult(null, swErr, SAVE_STATUS.UNSAVED));
                })
            }
        })
    }

    async syncGetResultToLocal(executionObj, resultJSON) {
        let info = new DatabaseExecutionObject("internal_put", executionObj.objectType, executionObj.objectKey, executionObj.extraAction, { data: resultJSON });
        return new LocalDatabaseConnection(SERVICE_WORKER_NETWORK_RESULT.PASSTHROUGH).execute(info);
    }

    //Process a call to the server without local fallback
    //Returns internal response format instead of public response format
    async processDirectCall(executionObj) {
        return new Promise((resolve, reject) => {
            var networkPromise = this.connection.execute(executionObj).then((resultObj) => {
                resolve(resultObj);
            }).catch((err) => {//network error
                reject(err);
            })
        })
    }
}

class LocalDatabaseConnection extends BaseConnection {
    networkSuccess;
    constructor(networkSuccess = SERVICE_WORKER_NETWORK_RESULT.UNSAVED) {
        super();
        this.networkSuccess = networkSuccess;
    }

    async execute(databaseExecutionObj) {
        return new Promise((resolve, reject) => {
            if (!navigator.serviceWorker?.controller) {
                reject("No service worker!");
                return;
            }
            var msgChannel = new MessageChannel();
            const msgPortTimeout = setTimeout(() => {
                msgChannel.port1.close();
                reject("service worker failure");
            }, 10000)
            //Set up response listener
            msgChannel.port1.onmessage = ((responseObj) => {
                clearTimeout(msgPortTimeout);
                let returnedObj = responseObj.data;
                let isWorkerSuccess = returnedObj.success;
                let workerPayload = returnedObj.payload;
                msgChannel.port1.close();
                if (isWorkerSuccess) {
                    resolve(workerPayload);
                    return;
                } else {
                    reject();
                    return;
                }
            })
            //Send message to worker
            navigator.serviceWorker.controller.postMessage({ type: "TEST_SHEETS/DATABASE_OPERATION", payload: databaseExecutionObj, networkSuccess: this.networkSuccess },
                [msgChannel.port2]);
            //If this is dealing with an offline change, set up a sync
            if (!this.networkSuccess) {
                registerOfflineSync("database");
            }
        })
    }
}