//Used for returning the action result, and storing save status locally
const SAVE_STATUS = { SERVER_SAVED: "onlsave", LOCAL_SAVED: "workersave", UNSAVED: "unsaved", SAVING: "saving", INITIAL: "init", INITIAL_UNSAVED: "initUn" };
//Used to indicate the network connectivity as determined by the service worker
const SERVICE_WORKER_CONNECTIVITY = { SYNC_IN_PROGRESS: "syncing", OFFLINE: "offline", ONLINE: "online", FAILED: "fail" };
//Used for signalling what kind of save operation is requested (server or local or passthrough), and for network request results internal to the network stack
const SERVICE_WORKER_NETWORK_RESULT = { SUCCESS: "success", FAILED: "fail", PASSTHROUGH: "passt", AUTOSYNC: "auto" }
var serviceWorkerRegistration = null;
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('../serviceWorker.js')
            .then(reg => serviceWorkerRegistration = reg)
            .catch(err => console.log('Registration failed:', err));
    });
}

async function registerOfflineSync(tag) {
    if (serviceWorkerRegistration && 'sync' in serviceWorkerRegistration) {
        await serviceWorkerRegistration.sync.register(tag);
    }
}

if (typeof window !== 'undefined' && navigator.serviceWorker?.controller && document.getElementById("networkSyncIndicator")) {
    const connectivityBroadcastChannel = new BroadcastChannel('TEST_SHEETS/SW_CONNECTIVITY');
    const networkSyncIndicator = document.getElementById("networkSyncIndicator");
    const networkSyncIndicatorIcon = document.getElementById("networkSyncIndicatorIcon");
    const networkSyncIndicatorText = document.getElementById("networkSyncIndicatorText");
    connectivityBroadcastChannel.onmessage = ((event) => {
        let status = event.data;
        setNetworkStatus(status);
    });

    function setNetworkStatus(status) {
        networkSyncIndicator.style.display = "flex";
        networkSyncIndicator.classList.value = "";
        networkSyncIndicatorButton.style.display = "none";
        switch (status) {
            case SERVICE_WORKER_CONNECTIVITY.SYNC_IN_PROGRESS:
                networkSyncIndicator.classList.add("sync");
                networkSyncIndicatorText.textContent = "Syncing";
                networkSyncIndicatorIcon.textContent = "sync";
                break;
            case SERVICE_WORKER_CONNECTIVITY.OFFLINE:
                networkSyncIndicator.classList.add("offline");
                networkSyncIndicatorText.textContent = "Offline";
                networkSyncIndicatorIcon.textContent = "globe_2_cancel";
                break;
            case SERVICE_WORKER_CONNECTIVITY.ONLINE:
                networkSyncIndicator.classList.add("online");
                networkSyncIndicatorText.textContent = "Online";
                networkSyncIndicatorIcon.textContent = "public";
                break;
            case SERVICE_WORKER_CONNECTIVITY.FAILED:
                networkSyncIndicator.classList.add("fail");
                networkSyncIndicatorText.textContent = "Sync Failure";
                networkSyncIndicatorIcon.textContent = "warning";
                networkSyncIndicatorButton.style.display = "inline";
                break;
            case null:
                networkSyncIndicator.style.display = "none";
                break;
        }
    }
    setNetworkStatus(null);

    window.addEventListener("online", () => {
        navigator.serviceWorker.controller.postMessage({ type: "TEST_SHEETS/CONNECTIVITY_PING" })
    })

    window.addEventListener("load", () => {
        navigator.serviceWorker.controller.postMessage({ type: "TEST_SHEETS/CONNECTIVITY_PING" })
    })
}

//Console command
function manualServiceDatabaseSync() {
    navigator.serviceWorker.controller.postMessage({ type: "TEST_SHEETS/CONNECTIVITY_PING" })
}

if (typeof window !== 'undefined' && document.getElementById("objectSaveIndicatorHolder")) {
    const markingSubSaveSpan = document.getElementById("objectSaveIndicatorHolder");
    const markingSubSaveIndicatorText = document.getElementById("objectSaveIndicator");
    const markingSubSaveIcon = document.getElementById("objectSaveIcon");
    function setSaveIndicator(status) {
        markingSubSaveSpan.classList.value = "";
        markingSubSaveSpan.style.display = "flex";
        markingSubSaveIndicatorText.textContent = "Saved";
        switch (status) {
            case SAVE_STATUS.INITIAL:
            case null:
                markingSubSaveSpan.style.display = "none";
                break;
            case SAVE_STATUS.INITIAL_UNSAVED:
                markingSubSaveIndicatorText.textContent = "Not Saved";
                markingSubSaveIcon.textContent = "cloud_off";
                break;
            case SAVE_STATUS.SAVING:
                markingSubSaveIndicatorText.textContent = "Saving";
                markingSubSaveIcon.textContent = "sync";
                markingSubSaveSpan.classList.add("saving");
                break;
            case SAVE_STATUS.SERVER_SAVED:
                markingSubSaveIndicatorText.textContent = "Saved";
                markingSubSaveIcon.textContent = "cloud_done";
                break;
            case SAVE_STATUS.LOCAL_SAVED:
                markingSubSaveIndicatorText.textContent = "Saved Locally";
                markingSubSaveIcon.textContent = "globe_2_cancel"
                markingSubSaveSpan.classList.add("warning");
                break;
            case SAVE_STATUS.UNSAVED:
                markingSubSaveIcon.textContent = "cloud_alert"
                markingSubSaveIndicatorText.textContent = "Not Saved";
                markingSubSaveSpan.classList.add("error");
                break;
            default:
                markingSubSaveIndicatorText.textContent = status;
                break;
        }
    }
}

//Shared Modification Functions
var uppercaseWords = function (value) {
    var splitString = value.toString().trim().split(" ");
    if (splitString.length === 0) {
        return value;
    }
    for (var i = 0; i < splitString.length; i++) {
        if (splitString[i].length > 0) {
            splitString[i] = splitString[i].charAt(0).toUpperCase() + splitString[i].substring(1);
        }
    }
    return splitString.join(" ");
};

const jsFieldValueModifications = {
    PostalCode: {
        //Formats a postal code into uppercase with a space
        Formatted: function (value) {
            var matchInfo = value.toUpperCase().match(/(\w{3})[ -]?(\w{3})/);
            if (matchInfo && matchInfo.length >= 3) {
                return matchInfo[1] + " " + matchInfo[2];
            } else {
                return value;
            }
        }
    },
    DOBM: {
        //Converts a written date ("Jan", "October") and returns the corresponding formatted month number (01,10)
        Numeric: function (value) {
            //Check for values that do not need to be formatted (ints)
            if (isNaN(value) || value !== parseInt(value)) {
                //Make a Date object and check if it is value
                let date = new Date(value + " 1 2000");
                if (!isNaN(date.valueOf())) {
                    //Valid date object
                    let monthNum = date.getMonth() + 1;
                    return (monthNum >= 10 ? monthNum : "0" + monthNum).toString();
                }
                //Invalid date object, return empty
                return "";
            } else {
                if (!isNaN(value)) {
                    //An int was provided, pass it through
                    return value;
                }
                return "";
            }
        }
    },
    DOB: {
        //Removes the 20 from a year (ex: 2025-05-12 -> 25-05-12)
        ShortYear: function (value) {
            let regexp = new RegExp("([0-9]{2,4})(-[0-9]{1,2}-[0-9]{1,2})");
            let matchInfo = regexp.exec(value);
            if (matchInfo && matchInfo.length === 3) {
                //If regex matches (4 number year)
                let yearMatch = matchInfo[1];
                return (yearMatch.length === 2 ? yearMatch : yearMatch.substring(2, 4)) + matchInfo[2];
            }
        }
    },
    Name: {
        Uppercase: uppercaseWords
    },
    Address: {
        Uppercase: uppercaseWords
    },
    City: {
        Uppercase: uppercaseWords
    },
    LSSId: {
        UppercaseID: function (value) {
            return value ? value.toUpperCase() : "";
        }
    }
};

const firebaseConfig = {
    apiKey: "AIzaSyA_4KE8cx9n3E6hOV17n8v15bDRuMked6Y",
    authDomain: "test-sheets-451300.firebaseapp.com",
    projectId: "test-sheets-451300",
    storageBucket: "test-sheets-451300.firebasestorage.app",
    messagingSenderId: "812050814842",
    appId: "1:812050814842:web:efc4d287032b60e5ce68c3"
};

function initFirebase() {
    return firebase.initializeApp(firebaseConfig);
}

function logoutUser() {
    firebase.auth().signOut();
    clearLoginSessionInfo();
    redirectTo("create");
}

function clearLoginSessionInfo() {
    if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "TEST_SHEETS/LOGOUT" });
    }
    sessionStorage.clear();
}

if (typeof window !== 'undefined') {
    window.addEventListener("load", async () => {
        let user = await awaitUserLoad();
        if (!user) {
            clearLoginSessionInfo();
        }
    });
}

var preRedirect;

function redirectTo(pageName) {
    if (preRedirect) {
        preRedirect();
    }
    window.location.href = `${pageName}.html`
}

//Connects to communcation topbar button
function redirectToCommunication(sheetObject) {
    window.location.href = `communication.html?id=${sheetObject.dbKey}`
}

//Connects to topbar button
async function signOut() {
    if (preRedirect) {
        await preRedirect();
    }
    logoutUser();
}

//Topbar dropdown menu
if (typeof window !== 'undefined' && document.getElementById("signOutButton")) {
    document.getElementById("signOutButton").addEventListener('click', () => {
        signOut();
    })

    let topbarDropdown = document.getElementById("topbarAccountDropdown");
    document.getElementById("topbarAccountButton").addEventListener("click", (e) => {
        e.stopPropagation();
        if (topbarDropdown.style.display === "block") {
            topbarDropdown.style.display = "none";
        } else {
            topbarDropdown.style.display = "block";
            document.body.addEventListener("click", () => {
                topbarDropdown.style.display = "none";
            }, { once: true })
        }
    })
}

function getRemoteFirebaseFunctions(fbApp = app) {
    var fns = fbApp.functions("northamerica-northeast1");
    if (self.location.hostname === "localhost" || self.location.hostname.startsWith("127.0.") || self.location.hostname === "" || self.location.hostname.startsWith("10.0.")) {
        fns.useEmulator("127.0.0.1", 5001);
    }
    return fns;
}

function awaitUserLoad() {
    return new Promise((resolve, reject) => {
        var user = firebase.auth().currentUser;
        if (user) {
            resolve(user);
            return;
        }
        var unsubFn = firebase.auth().onAuthStateChanged(user => {
            if (user) {
                unsubFn();
                resolve(user);
            }
            else {
                unsubFn();
                resolve(null);
            }
        })
    })
}

var connection;
function getConnectionManager(fbApp = app) {
    if (!connection) {
        connection = new ConnectionManager(new FirebaseFunctionsConnection(getRemoteFirebaseFunctions(fbApp)));
    }
    return connection;
}

function padZero(inputNum) {
    if (inputNum <= 9) {
        return `0${inputNum}`;
    } else {
        return `${inputNum}`
    }
}

const dataUrls = { fields: '../data/fieldDataFile.json', sheets: '../data/sheetDataFile.json', toolkit: '../data/toolkitDataFile.json' };
const dataFileNames = { fields: "fields", sheets: "sheets", toolkit: "toolkit" }

Object.freeze(dataUrls);
Object.freeze(dataFileNames);

async function loadJsonFiles(...filesToLoad) {
    var promises = [];
    filesToLoad.forEach(fileName => {
        promises.push(fetch(dataUrls[fileName]));
    });
    return Promise.all(promises).then((values) => {
        return Promise.all(values.map((response) => response.json())).then((jsonValues) => {
            var response = {};
            filesToLoad.forEach((fileName, index) => {
                response[fileName] = jsonValues[index];
            });
            return response;
        });
    });
}

async function resolveAllPromises(inObject) {
    const entries = Object.entries(inObject)
    const results = await Promise.all(entries.map(([_, promiseVal]) => promiseVal));
    var resultObj = Object.fromEntries(entries.map(([key, _], index) => [key, results[index]]));
    return resultObj;
}

function hideAllChildren(el) {
    for (const child of el.children) {
        child.style.display = "none";
    }
}

function clearChildren(el) {
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
}

function createElement(type, appendTo, textContent, classNames) {
    var el = document.createElement(type);
    if (appendTo) {
        appendTo.appendChild(el);
    }
    if (textContent) {
        el.textContent = textContent;
    }
    if (classNames) {
        el.className = classNames;
    }
    return el;
}

function createSkeleton(template, attachTo, clearText = true) {
    var fragment = template.content.cloneNode(true);
    var rootEl = fragment.firstElementChild;
    attachTo.appendChild(fragment);
    //Set Values
    rootEl.classList.add("skeleton-container");
    for (button of rootEl.querySelectorAll("button")) {
        button.disabled = true;
        if (clearText) {
            button.textContent = "";
        }
    }
    for (inputEl of rootEl.querySelectorAll("input")) {
        inputEl.disabled = true;
        if (clearText) {
            inputEl.placeholder = "";
        }
    }
    if (clearText) {
        for (el of rootEl.querySelectorAll("p, label, h1, h2, h3, h4, h5, h6, span.material-symbols-outlined")) {
            el.textContent = "";
        }
    }
    return rootEl;
}

function getSheetFromIdentifier(identifier) {
    return Object.entries(sheetData)
        .flatMap(([categoryName, categoryContentArray]) => categoryContentArray)
        .find(entry => entry.identifier === identifier);
}

async function getIndexDatabaseConnection() {
    return new Promise((resolve, reject) => {
        var openRequest = globalThis.indexedDB.open("offlineStore", 1);
        openRequest.onsuccess = ((event) => {
            var db = event.target.result;
            resolve(db);
        })
        openRequest.onerror = ((event) => {
            reject(null);
        });
        openRequest.onupgradeneeded = ((event) => {
            console.log("Upgrade", event.oldVersion);
            var db = event.target.result;
            switch (event.oldVersion) {
                case 0:
                    console.log("Creating")
                    db.createObjectStore("configurations");
                    db.createObjectStore("sheet");
                    db.createObjectStore("toolkit");
                    db.createObjectStore("pendingOperations", { keyPath: "id", autoIncrement: true });
            }
        })
    });
}

//Generates a random ID that is unique. Requires a function that takes in the generated ID
//and returns whether it is a duplicate
function generateUniqueId(isDuplicateFunction) {
    let generatedId = Math.random().toString(36).slice(2);
    //If the ID already exists, recursively generate a new one until unique
    if (isDuplicateFunction(generatedId) || generatedId.length === 0) {
        return generateUniqueId(isDuplicateFunction);
    } else {
        return generatedId;
    }
}