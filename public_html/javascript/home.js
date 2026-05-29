var sheetData;
var fieldData;
var toolkitKeys;

const app = initFirebase();

const dataManagerInstance = new DataManager(getConnectionManager());

//authentication handler
firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
        redirectToCreate();
    }
});

//Two-stage loading. This function only runs once to get static JSON
async function preLoad() {
    renderSkeletons();
    const loadingPromises = {
        dataFiles: loadJsonFiles(dataFileNames.sheets, dataFileNames.fields, dataFileNames.toolkit),
    }
    resolveAllPromises(loadingPromises).then((loadingResults) => {
        //JSON Data
        sheetData = loadingResults.dataFiles[dataFileNames.sheets];
        fieldData = loadingResults.dataFiles[dataFileNames.fields];
        toolkitKeys = Object.keys(loadingResults.dataFiles[dataFileNames.toolkit].sheets);
        runRender();
    }).catch((err) => {
        console.log(err);
        clearChildren(mainListHolder);
        this.alert("Error loading. Please try again later.");
    })
}

//Second stage. Runs on every connectivity change to get dynamic info.
async function runRender() {
    renderSkeletons();
    //Load JSON files
    await awaitUserLoad();
    const loadingPromises = {
        summaryInfo: dataManagerInstance.getSheetSummary(),
        userInfo: dataManagerInstance.getUserInformation(),
        offlineInfo: getOfflineInfoPromise()
    }
    resolveAllPromises(loadingPromises).then((loadingResults) => {
        //User data
        var sheetSummary = loadingResults.summaryInfo;
        var userInfo = loadingResults.userInfo;
        var offlineInfo = loadingResults.offlineInfo;
        //Render
        renderSheetList(sheetSummary, userInfo, offlineInfo);
    }).catch((err) => {
        console.log(err);
        clearChildren(mainListHolder);
        this.alert("Error loading. Please try again later.");
    })
};

window.addEventListener("load", preLoad);

function getOfflineInfoPromise() {
    return new Promise((resolve) => {
        if (!navigator.serviceWorker?.controller) {
            resolve({});
            return;
        }
        var msgChannel = new MessageChannel();
        //Set up response listener
        msgChannel.port1.onmessage = ((responseObj) => {
            msgChannel.port1.close();
            resolve(responseObj.data);
        })
        //Send message to worker
        navigator.serviceWorker.controller.postMessage({ type: "TEST_SHEETS/OFFLINE_SHEET_SAVE_STATUS" },
            [msgChannel.port2]);
    })
}

document.getElementById("signOutButton").onclick = function () {
    logoutUser();
}

function redirectToCreate() {
    window.location.href = "create.html"
}

function redirectToSheet(sheetId) {
    var sheetUrl = new URL("sheet.html", window.location.href);
    sheetUrl.searchParams.set("id", sheetId);
    window.location.href = sheetUrl.toString();
}

function redirectToToolkit(sheetId) {
    var sheetUrl = new URL("toolkit.html", window.location.href);
    sheetUrl.searchParams.set("id", sheetId);
    window.location.href = sheetUrl.toString();
}

const mainListHolder = document.getElementById("homeMainList");
const cardTemplate = document.getElementById("cardTemplate");
const newSheetCardTemplate = document.getElementById("newSheetCardTemplate");

function renderSkeletons() {
    const listStyleColumns = getComputedStyle(mainListHolder).gridTemplateColumns.split(" ");
    const numberOfSkeletons = listStyleColumns.length;
    clearChildren(mainListHolder);
    for (let i = 0; i < numberOfSkeletons; i++) {
        createSkeleton(cardTemplate, mainListHolder);
    }
}

function renderSheetList(data, userInfo, offlineData) {
    let offlineSyncedSheets = calculateFullySyncedSheets(data, offlineData);
    clearChildren(mainListHolder);
    for (const [sheetKey, sheetEntry] of Object.entries(data)) {
        //Append
        var sheetCardFragment = cardTemplate.content.cloneNode(true);
        var sheetCard = sheetCardFragment.firstElementChild;
        mainListHolder.appendChild(sheetCardFragment);
        //Get category & sheet information
        var sheetInfo = getSheetFromIdentifier(sheetEntry.sheetId)
        var categoryName = Object.entries(sheetData).find(([key, value]) => value.some((entry) => entry.identifier === sheetEntry.sheetId))?.[0];
        //Set Text & Color
        sheetCard.style.setProperty("--card-color", `var(--${categoryName},black)`);
        sheetCard.querySelector(".cardTitleText").textContent = sheetInfo.shortform;
        sheetCard.querySelector(".cardTitleDescriptor").textContent = sheetInfo.descriptionText;
        //Set sorting data
        sheetCard.dataset.createdAt = sheetEntry.createdAt;
        sheetCard.dataset.modifiedAt = sheetEntry.modifiedAt;
        sheetCard.dataset.sheetId = sheetEntry.sheetId;
        //Offline sync UI
        var cloudButton = sheetCard.querySelector("button.cloudStatusButton");
        if (!offlineSyncedSheets) {
            cloudButton.remove();
        } else {
            if (offlineSyncedSheets.includes(sheetKey)) {
                cloudButton.textContent = "cloud_done";
                cloudButton.title = "Available for offline use";
            } else {
                cloudButton.textContent = "cloud_upload";
                cloudButton.title = "Preload for offline use";
            }
        }
        cloudButton.addEventListener("click", (e) => {
            var btn = e.target;
            btn.textContent = "sync";
            btn.title = "Loading...";
            btn.disabled = true;
            btn.classList.add("sync");
            localLoadSheet(sheetKey).then(() => {
                btn.textContent = "cloud_done";
                btn.title = "Available for offline use";
            }).catch((err) => {
                btn.textContent = "cloud_upload";
                btn.title = "Preload for offline use";
                console.log("offline load failed", err);
            }).finally(() => {
                btn.disabled = false;
                btn.classList.remove("sync");
            })
        })
        //Input
        var labelInput = sheetCard.querySelector("input.cardLabelInput");
        labelInput.value = sheetEntry.label;
        labelInput.addEventListener("change", (e) => {
            var currentInput = e.target;
            let newLabelValue = currentInput.value;
            dataManagerInstance.setSheetLabel(sheetKey, newLabelValue);
            sheetEntry.label = newLabelValue;
        });
        //Info labels
        var candidateCountInfoText = sheetCard.querySelector(".cardInfoCandidates");
        candidateCountInfoText.textContent = sheetEntry.candidateCount;
        var modifiedAtInfoText = sheetCard.querySelector(".cardInfoModifiedAt");
        let modifiedAtDate = new Date(sheetEntry.modifiedAt);
        let monthStr = new Intl.DateTimeFormat("en-CA", { month: "long" }).format(modifiedAtDate);
        modifiedAtInfoText.textContent = `${monthStr} ${modifiedAtDate.getDate()} ${modifiedAtDate.getFullYear()} at 
        ${modifiedAtDate.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", hour12: true })}`;
        //Buttons
        let toolkitAvailable = toolkitKeys.includes(sheetEntry.sheetId);
        let toolkitButton = sheetCard.querySelector("button.cardToolkit");
        toolkitButton.disabled = !toolkitAvailable;
        if (toolkitAvailable) {
            toolkitButton.addEventListener("click", () => {
                redirectToToolkit(sheetKey);
            })
        }
        sheetCard.querySelector("button.cardDelete").addEventListener("click", async (e) => {
            var btn = e.target;
            if (!confirm(`Delete ${sheetEntry.label}? This cannot be undone.`)) {
                return;
            }
            try {
                btn.disabled = true;
                await dataManagerInstance.deleteSheet(sheetKey);
                delete data[sheetKey];
                btn.closest(".card").remove();
            } catch (err) {
                console.log(err);
                btn.disabled = false;
                alert("Error deleting sheet. Please try again later");
            }
        });
        sheetCard.querySelector("button.cardView").addEventListener("click", async () => {
            redirectToSheet(sheetKey);
        });
    };
    //New Sheet Button
    var newSheetCardFragment = newSheetCardTemplate.content.cloneNode(true);
    var newSheetButtonCard = newSheetCardFragment.firstElementChild;
    newSheetButtonCard.style.order = Number.MAX_SAFE_INTEGER;
    mainListHolder.appendChild(newSheetCardFragment);
    if (Object.keys(data).length < parseInt(userInfo.documentLimit)) {
        //User can still save sheets, remove warning
        newSheetButtonCard.querySelector("p.cardMaxSavesWarning").remove();
    }
    runSort("modified-at");
}

function runSort(sortMethod) {
    switch (sortMethod) {
        case "modified-at":
            handleBasicSort(sortMethod);
            break;
        case "created-at":
            handleBasicSort(sortMethod);
            break;
        case "course":
            var categoryOrdering = Object.values(sheetData).flatMap((category) => category.flatMap((entry) => entry.identifier));
            for (const card of mainListHolder.children) {
                if (card.classList.contains("newSheetCard")) {
                    card.style.order = Number.MAX_SAFE_INTEGER;
                    continue;
                }
                card.style.order = categoryOrdering.indexOf(card.dataset.sheetId);
            }
            break;
    }

    function handleBasicSort(sortMethod) {
        var values = [];
        for (const card of mainListHolder.children) {
            values.push(parseInt(card.getAttribute(`data-${sortMethod}`)));
        }
        values.sort((a, b) => b - a);
        for (const card of mainListHolder.children) {
            if (card.classList.contains("newSheetCard")) {
                card.style.order = Number.MAX_SAFE_INTEGER;
                continue;
            }
            card.style.order = values.indexOf(parseInt(card.getAttribute(`data-${sortMethod}`)));
        }
    }
}

function calculateFullySyncedSheets(sheetData, offlineData) {
    if (!offlineData?.sheet) {
        //No offline data/service worker
        return null;
    }
    //Loop over offline entries (The only ones that could possibly be synced)
    var syncedSheets = [];
    let offlineAllToolkits = new Set(Object.keys(offlineData.toolkit));
    for (const [sheetKey, offlineSheetOverview] of Object.entries(offlineData.sheet)) {
        if (!sheetData[sheetKey]) {
            //Offline but not online, will be purged later by service worker
            continue;
        }
        if (offlineSheetOverview.toolkitModifiedAt !== sheetData[sheetKey].toolkitModifiedAt) {
            //Mismatch in last toolkit modified, do not consider up-to-date
            continue;
        }
        if (offlineSheetOverview.modifiedAt !== sheetData[sheetKey].modifiedAt) {
            //Mismatch in last modified, do not consider up-to-date
            continue;
        }
        console.log(offlineSheetOverview)
        let interpreter = new ToolkitMappingFullInterpreter(offlineSheetOverview.toolkitMapping);
        let entries = interpreter.getSkillsList().map((skillName) => interpreter.getSkill(skillName)).map((skillInterpreter) => skillInterpreter.getAllEntries()).flat();
        let offlineSheetToolkits = entries.map((entryInterpreter) => `${sheetKey},${entryInterpreter.getId()}`);
        //Check if all toolkits for this sheet are cached
        if (offlineSheetToolkits.every((offlineSheetToolkit) => offlineAllToolkits.has(offlineSheetToolkit))) {
            syncedSheets.push(sheetKey);
        }
    }
    return syncedSheets;
}

async function localLoadSheet(sheetKey) {
    let sheet = (await dataManagerInstance.getSheetInstance(sheetKey)).setSheetInformation(sheetData).setFieldData(fieldData).build();
    let toolkitInterpreter = new ToolkitMappingFullInterpreter(sheet);
    if (toolkitInterpreter.getNumberOfSkills() === 0) {
        console.log("No toolkit")
        return;
    }
    let entries = toolkitInterpreter.getSkillsList().map((skillName) => toolkitInterpreter.getSkill(skillName)).map((skillInterpreter) => skillInterpreter.getAllEntries()).flat();
    let toolkitIds = entries.map((entryInterpreter) => entryInterpreter.getId());
    var loadPromises = [];
    for (const toolkitId of toolkitIds) {
        console.log(toolkitId, sheetKey)
        loadPromises.push(dataManagerInstance.getToolkitInstance(toolkitId, sheet));
    }
    await Promise.all(loadPromises);
}

const sortSelector = document.getElementById("sortSelect");
sortSelector.addEventListener("change", function () {
    runSort(sortSelector.value);
});

const connectivityBroadcastChannel = new BroadcastChannel('TEST_SHEETS/SW_CONNECTIVITY');
const offlineWarningBar = document.getElementById("offlineWarningBottomBar");
var lastNetworkStatus = SERVICE_WORKER_CONNECTIVITY.ONLINE;
connectivityBroadcastChannel.onmessage = ((event) => {
    let status = event.data;
    console.log(status, lastNetworkStatus)
    if (lastNetworkStatus !== status) {
        runRender();
    }
    lastNetworkStatus = status;
    switch (status) {
        case null:
        case SERVICE_WORKER_CONNECTIVITY.SYNC_IN_PROGRESS:
            break;
        case SERVICE_WORKER_CONNECTIVITY.FAILED:
        case SERVICE_WORKER_CONNECTIVITY.OFFLINE:
            offlineWarningBar.style.display = "block";
            break;
        case SERVICE_WORKER_CONNECTIVITY.ONLINE:
            offlineWarningBar.style.display = "none";
            break;
    }
});