class ServerTimeService {
    #ALLOWED_VARIANCE = 2000;
    calculatedOffset = 0;
    timeBroadcastChannel;
    #initiated = false;

    constructor() {
        this.timeBroadcastChannel = new BroadcastChannel('TEST_SHEETS/SERVERTIMECHANNEL');
        this.timeBroadcastChannel.onmessage = (event) => {
            console.log(event.data)
            this.calculatedOffset = event.data;
            this.#init();
        }
    }

    async #init() {
        if (this.#initiated) {
            return this;
        }
        this.calculatedOffset = await this.#loadOffsetFromDatabase() ?? 0;
        this.#initiated = true;
        return this;
    }

    async getActualTime() {
        await this.#init();
        return Date.now() + this.calculatedOffset;
    }

    updateTimeReference(clientRequestStartTime, serverHeader) {
        if (!serverHeader) {
            return;
        }
        let clientCurrentTime = Date.now();
        let serverTime = new Date(serverHeader)?.getTime();
        if (!serverTime || isNaN(serverTime)) return;
        let roundTripTime = clientCurrentTime - clientRequestStartTime;
        let aproxReturnTripTime = roundTripTime / 2;
        let currentServerTime = serverTime + aproxReturnTripTime;
        let offset = currentServerTime - clientCurrentTime;
        let roundedOffset = Math.abs(offset) > 2000 ? offset : 0;
        if (Math.abs(roundedOffset - this.calculatedOffset) > this.#ALLOWED_VARIANCE) {
            this.calculatedOffset = roundedOffset;
            this.#saveOffsetToDatabase(roundedOffset);
            this.timeBroadcastChannel.postMessage(roundedOffset);
        }
    }

    async #saveOffsetToDatabase(offsetValue) {
        let dbConnection;
        try {
            dbConnection = await getIndexDatabaseConnection();
        } catch (err) {
            return;
        }
        dbConnection.transaction(["configurations"], "readwrite").objectStore("configurations").put(offsetValue, "timestampOffset");
        dbConnection.close();
    }

    async #loadOffsetFromDatabase() {
        let dbConnection;
        try {
            dbConnection = await getIndexDatabaseConnection();
        } catch (err) {
            return;
        }
        let getPromise = new Promise((resolve) => {
            let getRequest = dbConnection.transaction(["configurations"], "readonly").objectStore("configurations").get("timestampOffset")
            getRequest.onsuccess = ((ev) => {
                dbConnection.close();
                resolve(ev.target.result);
            })
            getRequest.onerror = (() => {
                dbConnection.close();
                resolve(null);
            })
        })
    }
}