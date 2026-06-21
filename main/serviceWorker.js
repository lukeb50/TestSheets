importScripts("javascript/utility/ServerTimeService.js");

importScripts("javascript/models/BaseResponseAnswer.js");
importScripts("javascript/models/SheetContainer.js");

importScripts("javascript/models/ToolkitContainer.js");
importScripts("javascript/models/ToolkitMappingInterpreter.js");

importScripts("javascript/utility/utility.js");

importScripts("javascript/networking/ConnectionClasses.js");
importScripts("javascript/networking/FirebaseConnection.js");
importScripts("javascript/networking/ConnectionManager.js");
importScripts("javascript/utility/IndexedDbManager.js");

importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-auth-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-functions-compat.js");

const CACHE_VERSION = 1;
const CACHE_NAMES = {
    static: `static-cache-v${CACHE_VERSION}`
}

const HTML_TO_CACHE = ["home", "toolkit", "sheet"];

const ServerClockService = new ServerTimeService();

const indexedDbManagerInstance = new IndexedDbManager();

self.addEventListener('install', event => { });

self.addEventListener("activate", (event) => {
    purgeOldCaches(event);

});

var databaseConnectionInstance;

function purgeOldCaches(event) {
    const expectedCacheNamesSet = new Set(Object.values(CACHE_NAMES));
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames.map((cacheName) => {
                    if (!expectedCacheNamesSet.has(cacheName)) {
                        // If this cache name isn't present in the set of
                        // "expected" cache names, then delete it.
                        return caches.delete(cacheName);
                    }
                    return undefined;
                })
            )
        )
    )
}

self.addEventListener("fetch", (event) => {
    let request = event.request;
    let requestDestination = request.destination;
    //Local testing short-circuit
    if (self.location.hostname === "localhost" || self.location.hostname.startsWith("127.0.") || self.location.hostname === "" || self.location.hostname.startsWith("10.0.")) {
        return;
    }
    if (requestDestination === "style" || requestDestination === "script" || requestDestination === "image" ||
        requestDestination === "document" || requestDestination === "font" || request.url.endsWith(".json")) {
        if (requestDestination === "document" && !(HTML_TO_CACHE.some((urlPart) => request.url.includes(`html/${urlPart}.html`)))) {
            //Request for a HTML file that is not supposed to hit the cache.
            return;
        }
        //Static assets, cache them
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                // 1. Return cached response if found
                if (cachedResponse) {
                    return cachedResponse;
                }
                // 2. Otherwise, fetch from network
                var networkRequestStartTime = Date.now();
                return fetch(event.request).then((networkResponse) => {
                    ServerClockService.updateTimeReference(networkRequestStartTime, networkResponse.headers.get("date"))
                    return caches.open(CACHE_NAMES['static']).then((cache) => {
                        // 3. Save a clone in the cache for next time
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
        );
    }
})

const replayExcludedMethods = ["get", "query", "internal_put"];
const savedObjectTypes = ["sheet", "toolkit"];
self.addEventListener("message", async (event) => {
    event.waitUntil((async () => {
        if (!event.data || !event.data.type || !event.data.type.startsWith("TEST_SHEETS/")) {
            return null;
        }
        if (event.data.type === "TEST_SHEETS/DATABASE_OPERATION") {
            let eventPayload = event.data.payload;
            let data = event.data;
            //Network indicator
            const connectivityBroadcastChannel = new BroadcastChannel('TEST_SHEETS/SW_CONNECTIVITY');
            if (event.data.networkSuccess === SERVICE_WORKER_NETWORK_RESULT.SUCCESS || event.data.networkSuccess === SERVICE_WORKER_NETWORK_RESULT.FAILED) {
                connectivityBroadcastChannel.postMessage(event.data.networkSuccess === SERVICE_WORKER_NETWORK_RESULT.SUCCESS ? SERVICE_WORKER_CONNECTIVITY.ONLINE : SERVICE_WORKER_CONNECTIVITY.OFFLINE);
            }
            //If a network save just occured, clear all pending operations on that object
            if (eventPayload.method === "save" && event.data.networkSuccess === SERVICE_WORKER_NETWORK_RESULT.SUCCESS) {
                await prunePendingKey(eventPayload.objectType, eventPayload.objectKey);
            }
            let replyPort = event.ports[0];
            if (!savedObjectTypes.includes(event.data.payload.objectType)) {
                replyPort.postMessage({ success: false, payload: null });
                return;
            }
            let dbTransaction = await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.WRITE, [eventPayload.objectType, "pendingOperations"]);
            let objectTypeStore = dbTransaction.getStore(eventPayload.objectType);
            //Perform ops. Not using Promise.all so that operations run consecutively (Handle the operation, then commit it to the pending queue).
            //Avoids edge case of a delete taking longer to execute, and wiping out a queued server replay of that same delete operation.
            try {
                let results = [
                    await handleDbOperation(eventPayload, objectTypeStore),
                    await savePendingDbOperation(eventPayload, event.data.networkSuccess)
                ]
                replyPort.postMessage({ success: true, payload: results[0] });
            } catch (err) {
                console.log(err);
                replyPort.postMessage({ success: false, payload: null });
            } finally {
                replyPort.close();
            }
        } else if (event.data.type === "TEST_SHEETS/LOGOUT") {
            //Clear all offline database information
            try {
                let transaction = (await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.WRITE, [...savedObjectTypes, "pendingOperations", "configurations"]));
                await transaction.getStore("pendingOperations").clear();
                await transaction.getStore("configurations").clear();
                for (const objectType of savedObjectTypes) {
                    await transaction.getStore(objectType).clear();
                }
            } catch (err) {
                console.log("Failed to log out on service worker", err);
            }
        } else if (event.data.type === "TEST_SHEETS/CONNECTIVITY_PING") {
            replayOfflineOperations();
        } else if (event.data.type === "TEST_SHEETS/OFFLINE_SHEET_SAVE_STATUS") {
            let replyPort = event.ports[0];
            try {
                var offlineStoreInfo = {};
                var promises = [];
                for (const objectType of ['sheet', 'toolkit']) {
                    offlineStoreInfo[objectType] = {};
                    promises.push(new Promise(async (resolve, reject) => {
                        let dbTransaction = (await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.READONLY, objectType)).getStore(objectType);
                        dbTransaction.openCursor((value, key) => {
                            offlineStoreInfo[objectType][key] = { modifiedAt: value.modifiedAt ?? -1 };
                            if (objectType === "sheet") {
                                offlineStoreInfo[objectType][key]['toolkitModifiedAt'] = value.toolkitModifiedAt;
                                offlineStoreInfo[objectType][key]['toolkitMapping'] = value.toolkitMapping ?? {};
                            }
                        }).then(() => {
                            resolve();
                        }).catch(() => {
                            reject();
                        })
                    }));
                }
                await Promise.all(promises);
                replyPort.postMessage(offlineStoreInfo);
                replyPort.close();
            } catch (err) {
                console.log("Unable to get offline info", err);
            }
        }
    })())
})

async function handleDbOperation(eventPayload, dbObjectStore) {
    return new Promise(async (resolve, reject) => {
        try {
            switch (eventPayload.method) {
                case "get":
                    //This is an offline call
                    var val = await dbObjectStore.get(eventPayload.objectKey);
                    resolve(val);
                    break;
                case "query":
                    var val = await runQueryRequest(eventPayload, dbObjectStore);
                    resolve(val);
                    break;
                case "save":
                    if (eventPayload.requestBody.data) {
                        //If the key is unset, provision a temporary key
                        //Composite keys are arrays
                        let calculatedKey = eventPayload.objectKey;
                        let calculatedKeyPortion = Array.isArray(calculatedKey) ? calculatedKey[calculatedKey.length - 1] : calculatedKey;
                        //Apply the key
                        eventPayload.objectKey = calculatedKey;
                        if (Object.keys(eventPayload.requestBody).includes("key")) {
                            eventPayload.requestBody.key = calculatedKeyPortion;
                        }
                        //Store
                        await dbObjectStore.put(eventPayload.requestBody.data, calculatedKey);
                        resolve(calculatedKeyPortion);
                    }
                    break;
                case "update":
                    var val = await createUpdateRequest(eventPayload, dbObjectStore);
                    return val;
                    break;
                case "delete":
                    //Any queued save/update operations need to be removed
                    await prunePendingKey(eventPayload.objectType, eventPayload.objectKey);
                    //Start a new transaction due to awaiting prune
                    let dbTransaction = await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.WRITE, [eventPayload.objectType]);
                    dbObjectStore = dbTransaction.getStore(eventPayload.objectType);
                    await dbObjectStore.delete(eventPayload.objectKey);
                    resolve();
                    break;
                case "internal_put":
                    await dbObjectStore.put(eventPayload.requestBody.data, eventPayload.objectKey);
                    resolve(eventPayload.objectKey);
                    break;
                default:
                    reject("Invalid method");
                    break;
            }
        } catch (err) {
            reject(err);
        }
    })
}

async function savePendingDbOperation(eventPayload, networkSuccessEnum) {
    return new Promise(async (resolve, reject) => {
        if (networkSuccessEnum === SERVICE_WORKER_NETWORK_RESULT.SUCCESS || networkSuccessEnum === SERVICE_WORKER_NETWORK_RESULT.PASSTHROUGH) {
            //If successful or a passthrough, don't save for replay
            //If failed or an autosave, save for replay
            resolve();
            return;
        }
        if (replayExcludedMethods.includes(eventPayload.method)) {
            //Don't replay excluded operations (like gets)
            resolve();
            return;
        }
        let dbTransaction = await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.WRITE, ["pendingOperations"]);
        dbTransaction.getStore("pendingOperations").put(eventPayload).then(() => {
            resolve();
        }).catch(() => {
            reject();
        })
    })
}

async function createUpdateRequest(eventPayload, dbObjectStore) {
    return new Promise((resolve, reject) => {
        switch (eventPayload.objectType) {
            case "sheet":
                switch (eventPayload.extraAction) {
                    case "label":
                        //Load existing (if it exists)
                        dbObjectStore.get(eventPayload.objectKey).then((sheet) => {
                            console.log(sheet);
                            if (!sheet) {
                                reject("Not in local storage");
                                return;
                            }
                            //Update the value
                            sheet.label = eventPayload.requestBody.label;
                            //Return the request
                            resolve(dbObjectStore.put(sheet, eventPayload.objectKey));
                        }).catch((err) => {
                            console.log(err);
                            reject("db error");
                        })
                        break;
                    default:
                        reject("Sheet update not implemented");
                        break;
                }
                break;
            case "toolkit":
                reject("toolkit update not implemented")
                break;
        }
    })
}

function runQueryRequest(eventPayload, dbObjectStore) {
    return new Promise(async (resolve, reject) => {
        switch (eventPayload.objectType) {
            case "sheet":
                switch (eventPayload.extraAction) {
                    case "summary":
                        var resultData = {};
                        dbObjectStore.openCursor((value, key) => {
                            resultData[key] = {
                                createdAt: value.createdAt,
                                modifiedAt: value.modifiedAt,
                                toolkitModifiedAt: value.toolkitModifiedAt,
                                sheetId: value.sheetId,
                                label: value.label,
                                candidateCount: value.candidateCount
                            }
                        }).then(() => {
                            resolve(resultData);
                        }).catch((err) => {
                            reject(e);
                        })
                        break;
                    default:
                        reject("Sheet query not implemented");
                        break;
                }
                break;
            case "toolkit":
                switch (eventPayload.extraAction) {
                    case "results":
                        let attachedSheetKey = eventPayload.requestBody.attachedSheetKey;
                        (await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.READONLY, "sheet")).getStore("sheet").get(attachedSheetKey).then(async (rawSheet) => {
                            //Get values
                            let toolkitInterpreter = new ToolkitMappingFullInterpreter(rawSheet.toolkitMapping ?? {});
                            let queryType = eventPayload.requestBody.queryType;
                            let queryValue = eventPayload.requestBody.queryValue;
                            let queryExclusions = eventPayload.requestBody.queryExclusions;
                            //Compute
                            let potentialIdsToQuery = calculateRelevantResultIds(queryType, queryValue, toolkitInterpreter);
                            var idsToQuery = potentialIdsToQuery.filter((id) => !queryExclusions.includes(id));
                            if (potentialIdsToQuery === null) {
                                reject("Invalid results query type");
                            }
                            if (idsToQuery.length === 0) {
                                resolve({ relevantIds: potentialIdsToQuery, sheets: {} });
                            }
                            let toolkitStore = (await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.READONLY, "toolkit")).getStore("toolkit")
                            let results = {};
                            try {
                                for (const toolkitId of idsToQuery) {
                                    results[toolkitId] = await toolkitStore.get(ConnectionManager.createToolkitCompositeKey(toolkitId, attachedSheetKey));
                                }
                                resolve({ relevantIds: potentialIdsToQuery, sheets: results });
                            } catch (err) {
                                console.log(getConnectionManager(fbApp));
                                reject("Read error");
                            }
                        }).catch((err) => {
                            console.log(err)
                            reject("sheet not loaded");
                        })
                        break;
                    default:
                        reject("Toolkit query not implemented");
                        break;
                }
                break;
        }
    })
}

function calculateRelevantResultIds(queryType, queryValue, toolkitInterpreter) {
    //potentialIdsToQuery Ids that need to be queried
    var potentialIdsToQuery = [];
    const allEntries = toolkitInterpreter.getSkillsList().map((skillName) => toolkitInterpreter.getSkill(skillName)).map((skillInterpreter) => skillInterpreter.getAllEntries()).flat();
    if (queryValue === "*") {//* query for overview report, get all toolkits with at least 1 candidate included
        allEntries.forEach((sheetEntryInterpreter) => {
            if (sheetEntryInterpreter.getCandidateCount() > 0) {
                potentialIdsToQuery.push(sheetEntryInterpreter.getId());
            }
        })
    } else {//Query for a specific value
        switch (queryType) {
            case "candidate":
                allEntries.forEach((entryInterpreter) => {
                    if (entryInterpreter.getCandidateIds().includes(queryValue)) {
                        potentialIdsToQuery.push(entryInterpreter.getId());
                    }
                })
                break;
            case "skill":
                if (!toolkitInterpreter.getSkill(queryValue)) {
                    break;
                }
                toolkitInterpreter.getSkill(queryValue).forEach((entryInterpreter) => {
                    potentialIdsToQuery.push(entryInterpreter.getId());
                })
                break;
            default:
                return null;
        }
    }
    return potentialIdsToQuery;
}

self.addEventListener("sync", (event) => {
    event.waitUntil(replayOfflineOperations());
})

function replayOfflineOperations() {
    const PERMANENT_400_ERRORS = new Set([400, 404, 409, 412, 422]);
    var temporaryKeyMappings = {};
    const saveBroadcastChannel = new BroadcastChannel('TEST_SHEETS/OFFLINE_SAVE_EVENT');
    const connectivityBroadcastChannel = new BroadcastChannel('TEST_SHEETS/SW_CONNECTIVITY');
    return new Promise(async (res, rej) => {
        var operationsMap;
        try {
            //Open the database
            //Remove any duplicate entries so that network calls are minimized
            await prunePendingOperations();
            //get pending operations after the prune
            operationsMap = await getPendingOperations();
        } catch (err) {
            console.log(err);
            reject("replay load failure");
            return;
        }
        if (operationsMap.size === 0) {
            resolve(false);
            return;
        }
        connectivityBroadcastChannel.postMessage(SERVICE_WORKER_CONNECTIVITY.SYNC_IN_PROGRESS);
        //Get the default connection manager
        let fbApp = initFirebase();
        var networkConnection = getConnectionManager(fbApp);
        await awaitUserLoad();
        for (const [key, operation] of operationsMap) {
            try {
                let result = await runRequest(operation, networkConnection);
                if (result.statusCode < 300) {
                    //Nothing, fall through
                } else if (!PERMANENT_400_ERRORS.has(result.statusCode)) {
                    //Not one of the error status codes that should prompt a removal of the operation from the db
                    reject("Request server failure");
                    return;
                }
            } catch (networkErr) {
                console.log(networkErr)
                reject("Network failure");
                return;
            }
            saveBroadcastChannel.postMessage({ type: operation.objectType, key: operation.objectKey });
            try {
                let pendingStore = (await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.WRITE, "pendingOperations")).getStore("pendingOperations");
                await pendingStore.delete(key);
            } catch (err) {
                console.log(err);
                reject("Unable to remove completed operation from db");
                break;
            }
        }
        resolve(true);

        function resolve(syncUpdate) {
            if (syncUpdate) {
                connectivityBroadcastChannel.postMessage(SERVICE_WORKER_CONNECTIVITY.ONLINE);
            }
            res();
        }

        function reject(v) {
            console.log(v);
            connectivityBroadcastChannel.postMessage(SERVICE_WORKER_CONNECTIVITY.OFFLINE);
            rej(v);
        }
    })

    function runRequest(operationObject, netConnection) {
        return netConnection.processDirectCall(operationObject);
    }

    function getPendingOperations() {
        return new Promise(async (resolve, reject) => {
            try {
                pendingStore = (await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.READONLY, "pendingOperations")).getStore("pendingOperations");
                var operations = new Map();
                pendingStore.openCursor((value, key) => {
                    operations.set(key, DatabaseExecutionObject.fromJson(value));
                }).then(() => {
                    resolve(operations);
                }).catch(() => {
                    reject();
                })
            } catch (err) {
                reject();
                console.log(err)
            }
        })
    }
}

function prunePendingKey(type, key) {
    return prunePendingOperationsInternal(type, key)
}

function prunePendingOperations() {
    return prunePendingOperationsInternal(null, null);
}

function prunePendingOperationsInternal(pruneType = null, pruneKey = null) {
    return new Promise(async (resolve, reject) => {
        //Database open
        let pendingObjectStore;
        try {
            pendingObjectStore = (await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.WRITE, "pendingOperations")).getStore("pendingOperations");
        } catch (err) {
            console.log(err);
            reject();
            return;
        }
        //Open the cursor, running in reverse (most recent first)
        var trackedOperations = {};
        pendingObjectStore.openCursor((operationDbEntry, key, cursor) => {
            //Determine if this entry is to be completely pruned by request
            if (pruneType && pruneType === operationDbEntry.objectType && pruneKey && checkKeysMatch(pruneKey, operationDbEntry.objectKey)) {
                cursor.delete();
                return;
            }
            //Add entry to tracking if first time this key has been seen
            if (!trackedOperations[operationDbEntry.objectType]) {
                trackedOperations[operationDbEntry.objectType] = {};
            }
            if (!trackedOperations[operationDbEntry.objectType][JSON.stringify(operationDbEntry.objectKey)]) {
                trackedOperations[operationDbEntry.objectType][JSON.stringify(operationDbEntry.objectKey)] = [];
            }
            //See if this operation has already been performed
            let trackingEntry = trackedOperations[operationDbEntry.objectType][JSON.stringify(operationDbEntry.objectKey)];
            if (trackingEntry.includes(`${operationDbEntry.method}:${operationDbEntry.extraAction}`) || trackingEntry.includes(`delete:`)) {
                //An operation for this key and this method has already been seen, this request is stale.
                //Or, the object has a delete request against it, so don't bother saving
                cursor.delete();
                return;
            } else {
                //First time seeing this operation for this key, note it
                trackingEntry.push(`${operationDbEntry.method}:${operationDbEntry.extraAction}`);
            }
        }, "prev").then(() => {
            resolve();
        }).catch((err) => {
            reject();
        })
    })

    function checkKeysMatch(key1, key2) {
        if (Array.isArray(key1) !== Array.isArray(key2)) {
            return false;
        }
        if (Array.isArray(key1)) {
            return key1.every((val, i) => key2[i] === val)
        } else {
            return key1 === key2;
        }
    }
}

function getServiceWorkerDatabase() {
    return new Promise(async (resolve, reject) => {
        if (databaseConnectionInstance) {
            resolve(databaseConnectionInstance);
        } else {
            try {
                databaseConnectionInstance = await getIndexDatabaseConnection();
                resolve(databaseConnectionInstance);
            } catch (err) {
                reject(err);
            }
        }
    })
}