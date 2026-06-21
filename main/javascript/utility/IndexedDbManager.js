TRANSACTION_MODE = { READONLY: "readonly", WRITE: "readwrite" };
INSTANCE_TYPE = { MAIN: "main", CANDIDATE: "candidate" };
class IndexedDbManager {
    #connectionPromise;
    #instanceType;

    #instanceInfo = { "main": { name: "offlineStore", version: 1 }, "candidate": { name: "candidate", version: 1 } }

    constructor(instanceType = INSTANCE_TYPE.MAIN) {
        this.#instanceType = instanceType;
    }

    async #getConnection() {
        //Connection exists, test it
        if (this.#connectionPromise) {
            try {
                let connection = await this.#connectionPromise;
                if (!connection || connection.objectStoreNames === undefined) {
                    throw new Error();
                }
            } catch (err) {
                this.#connectionPromise = null;
            }
        }
        //If the connection exists and has been proven valid, return it
        if (this.#connectionPromise) {
            return this.#connectionPromise;
        }
        //No connection, create one
        this.#connectionPromise = new Promise((resolve, reject) => {
            var openRequest = globalThis.indexedDB.open(this.#instanceInfo[this.#instanceType].name, this.#instanceInfo[this.#instanceType].version);
            openRequest.onsuccess = ((event) => {
                const db = event.target.result;
                db.onversionchange = () => {
                    db.close();
                    this.#connectionPromise = null;
                };
                db.onclose = () => {
                    this.#connectionPromise = null;
                }
                resolve(event.target.result);
            })
            openRequest.onerror = ((event) => {
                reject(null);
            });
            openRequest.onupgradeneeded = ((event) => {
                this.#upgrade(event);
            })
        });
        return this.#connectionPromise;
    }

    #upgrade(event) {
        var db = event.target.result;
        if (this.#instanceType === INSTANCE_TYPE.MAIN) {
            switch (event.oldVersion) {
                case 0:
                    db.createObjectStore("configurations");
                    db.createObjectStore("sheet");
                    db.createObjectStore("toolkit");
                    db.createObjectStore("pendingOperations", { keyPath: "id", autoIncrement: true });
            }
        } else if (this.#instanceType === INSTANCE_TYPE.CANDIDATE) {
            switch (event.oldVersion) {
                case 0:
                    db.createObjectStore("candidate");
            }
        }
    }

    async startTransaction(transactionMode, objectScopes) {
        let connection = await this.#getConnection();
        return new IndexedDbTransaction(connection.transaction(objectScopes, transactionMode));
    }

    async closeConnection() {
        (await this.#getConnection()).close();
        this.#connectionPromise = null;
    }
}

class IndexedDbTransaction {
    #transaction;
    constructor(transactionRef) {
        this.#transaction = transactionRef;
    }

    getStore(storeName) {
        return new IndexedDbObjectStore(this.#transaction.objectStore(storeName));
    }
}

class IndexedDbObjectStore {
    #objectStore;
    constructor(objectStoreRef) {
        this.#objectStore = objectStoreRef;
    }

    #handleCallbacks(requestObj) {
        return new Promise((resolve, reject) => {
            requestObj.onsuccess = (ev) => {
                resolve(ev.target.result);
            }

            requestObj.onerror = (ev) => {
                reject();
            }
        });
    }

    async get(key) {
        return await this.#handleCallbacks(this.#objectStore.get(key));
    }

    async add(value, key = undefined) {
        return await this.#handleCallbacks(this.#objectStore.add(value, key));
    }

    async put(value, key = undefined) {
        return await this.#handleCallbacks(this.#objectStore.put(value, key));
    }

    async delete(key) {
        return await this.#handleCallbacks(this.#objectStore.delete(key));
    }

    async clear() {
        return await this.#handleCallbacks(this.#objectStore.clear());
    }

    /**
     * @param {*} successCallback called with parameters (value,key)
     * @param {*} direction an indexedDB direction string
     * @returns resolves on completion
     */
    async openCursor(successCallback, direction = "next") {
        return new Promise((resolve, reject) => {
            let cursorRequest = this.#objectStore.openCursor(null, direction);
            cursorRequest.onerror = () => {
                reject();
            }
            cursorRequest.onsuccess = (event) => {
                let cursor = event.target.result;
                if (!cursor) {
                    resolve();
                    return;
                }
                successCallback(cursor.value, cursor.key, cursor);
                cursor.continue();
            }
        })
    }
}