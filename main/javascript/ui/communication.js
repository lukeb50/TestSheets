const app = initFirebase();

const dataManagerInstance = new DataManager(getConnectionManager());

const bypassDialog = document.getElementById("bypassDialog");

const mainPanel = document.getElementById("communicationMainPanel");
const splashPanel = document.getElementById("communicationSplashScreen");

const qrCodeCanvas = document.getElementById("qrImage");

const expiryLabel = document.getElementById("expiryTimeLabel");
const limitLabel = document.getElementById("qrCodeCandidateLimitLabel");
const qrCandidateList = document.getElementById("qrCandidateList");

const communicationSaveIndicator = document.getElementById("communicationSaveIndicator");
const saveIndicator = document.getElementById("objectSaveIndicator");
const saveIcon = document.getElementById("objectSaveIcon");

var configData;

onChange = (() => {
    communicationSaveIndicator.className = "";
        communicationSaveIndicator.classList.add("pending");
    saveIndicator.textContent = "Changes Pending";
    saveIcon.textContent = "save_clock";
    return false;
})

saveExecuteFn = (async (mode) => {
    return await dataManagerInstance.saveCommunicationConfiguration(configData, mode);
})

allowSave = (() => {
    return configData !== null;
});

preRedirect = (async () => {
    await forceSave();
})

var firstFail = true;
onSaveFail = (() => {
    if (firstFail) {//Only alert on first failure. A successful save will clear this flag.
        alert("Error saving");
        firstFail = false;
    }
    saveIndicator.textContent = "Changes Unsaved";
    saveIcon.textContent = "error";
    communicationSaveIndicator.className = "";
    communicationSaveIndicator.classList.add("unsaved");
});

onSaveSuccess = (() => {
    communicationSaveIndicator.className = "";
    saveIndicator.textContent = "Changes Published";
    saveIcon.textContent = "save";
})

firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
        redirectTo('create');
    }
});

window.addEventListener("load", async () => {
    showSpinner();
    var params = new URLSearchParams(window.location.search);
    if (!params.has("id") || !await awaitUserLoad()) {
        alert("Invalid navigation");
        redirectTo("home");
        return;
    }
    var sheetId = params.get("id");
    const loadingPromises = {
        registrationInfo: dataManagerInstance.getCommunicationRegistration(sheetId)
    }
    resolveAllPromises(loadingPromises).then((loadingResults) => {
        let registrationInfo = loadingResults.registrationInfo;
        console.log(registrationInfo)
        if (registrationInfo) {
            //Show main control screen
            renderMainPanel(sheetId, registrationInfo);
        } else {
            //Show splash screen
            splashPanel.style.display = "block";
        }
    }).catch((err) => {
        console.log(err);
        //TODO: Show offline screen
        this.alert("Error loading. Please try again later.");
    }).finally(() => {
        hideSpinner();
    })
});

document.getElementById("splashStartButton").addEventListener("click", () => {
    showSpinner();
    var params = new URLSearchParams(window.location.search);
    var sheetId = params.get("id");
    dataManagerInstance.createCommunicationRegistration(sheetId).then((registrationInfo) => {
        renderMainPanel(sheetId, registrationInfo);
    }).catch((err) => {
        alert("Unable to start. Check your network connection and make sure you do not have 2 communication classes set up already.");
        hideSpinner();
    });
})

async function renderMainPanel(sheetId, registrationInfo) {
    //Show save status
    communicationSaveIndicator.style.display = "flex";
    //Load sheet
    showSpinner();
    var sheetContainer;
    try {
        sheetContainer = (await dataManagerInstance.getSheetInstance(sheetId)).build();
        configData = await dataManagerInstance.getCommunicationConfiguration(registrationInfo.registrationId);
        renderConfigurationPanel();
    } catch (err) {
        console.log(err);
        alert("Unable to load");
        return;
    } finally {
        hideSpinner();
    }
    //QR code list
    renderQrList(sheetContainer, registrationInfo.registrationId);
    //UI
    splashPanel.style.display = "none";
    mainPanel.style.display = "flex";
    //QR code
    QRCode.toCanvas(qrCodeCanvas, `https://localhost:5500/public_html/candidate/candidateNotification.html?code=${registrationInfo.registrationId}`, { errorCorrectionLevel: 'M' }, function (err) {
        if (err) {
            alert("Unable to generate QR code, please try again later");
        }
    });
    runExpiryLabel(registrationInfo.expiry);
}

listUpdateDebounceTimeout = null;

const template = document.getElementById("qrListTemplate");
const qrListRefreshButton = document.getElementById("qrListRefreshButton");

async function renderQrList(sheetContainer, registrationId) {
    qrListRefreshButton.disabled = true;
    //Skeletons
    clearChildren(qrCandidateList);
    for (let i = 0; i < (sheetContainer.getNumberOfResponses()); i++) {
        createSkeleton(template, qrCandidateList, true);
    }
    var candidateData;
    try {
        candidateData = await dataManagerInstance.getCommunicationRegisteredCandidates(registrationId);
    } catch (err) {
        console.log(err);
        clearChildren(qrCandidateList);
        createElement("p", qrCandidateList, "Unable to load candidates", "qrListError");
        setTimeout(resetQrListDebounce, 5000);
        return;
    }
    limitLabel.textContent = `Your current limit: ${candidateData.max} Candidates`
    clearChildren(qrCandidateList);
    for (const response of sheetContainer.getResponses()) {
        var responseId = response.responseId;
        var fragment = template.content.cloneNode(true);
        var rootEl = fragment.firstElementChild;
        qrCandidateList.appendChild(fragment);
        rootEl.querySelector(".qrListCandidateNameLabel").textContent = getCandidateName(sheetContainer, responseId);
        let icon = rootEl.querySelector(".qrListCandidateIcon");
        let bypassBtn = rootEl.querySelector("button.qrListCandidateBypassButton");
        if (candidateData.candidates.includes(responseId)) {
            //Candidate is registered
            icon.textContent = "person_check";
            rootEl.classList.add("registered");
            bypassBtn.disabled = true;

        } else if (candidateData.count < candidateData.max) {
            //Candidate not registered, still room
            icon.textContent = "person";
        } else {
            //Candidate not registered, no room
            icon.textContent = "person_off"
        }
        //Handle bypass button
        function handleBypassButtonPress(bypassBtn, response) {
            bypassBtn.onclick = function () {
                showSpinner();
                dataManagerInstance.getCommunicationBypassKey(registrationId, response.responseId).then((bypassKey) => {
                    showDialog(bypassDialog);
                    document.getElementById("bypassCodeNameLabel").textContent = getCandidateName(sheetContainer, response.responseId);
                    document.getElementById("bypassCodeLabel").textContent = bypassKey;
                }).catch((err) => {
                    hideSpinner();
                    alert("Unable to get code");
                });
            }
        }
        handleBypassButtonPress(bypassBtn, response);
    }

    //Adjust debounces
    qrListRefreshButton.onclick = function () {
        qrListRefreshButton.disabled = true;
        renderQrList(sheetContainer, registrationId);
    }
    setTimeout(resetQrListDebounce, 5000);
}

function resetQrListDebounce() {
    qrListRefreshButton.disabled = false;
}

function runExpiryLabel(expiryTimestamp) {
    //Time constants
    const MIN = 60 * 1000;
    const HR = MIN * 60;
    const DAY = HR * 24;
    const WEEK = DAY * 7;
    const MONTH = DAY * 30;
    //Expiry calculation
    let timeUntilExpired = new Date(expiryTimestamp) - Date.now();
    if (timeUntilExpired <= 0) {
        splashPanel.style.display = "block";
        mainPanel.style.display = "none";
        return;
    }
    //Find most appropriate unit
    var timeout;
    var text;
    if (timeUntilExpired > MONTH) {
        let count = Math.floor(timeUntilExpired / MONTH);
        text = `${count} Month${count > 1 ? "s" : ""}`;
        timeout = timeUntilExpired % MONTH;
    } else if (timeUntilExpired > WEEK) {
        let count = Math.floor(timeUntilExpired / WEEK);
        text = `${count} Week${count > 1 ? "s" : ""}`;
        timeout = timeUntilExpired % WEEK;
    } else if (timeUntilExpired > DAY) {
        let count = Math.floor(timeUntilExpired / DAY);
        text = `${count} Day${count > 1 ? "s" : ""}`;
        timeout = timeUntilExpired % DAY;
    } else if (timeUntilExpired > HR) {
        let count = Math.floor(timeUntilExpired / HR);
        text = `${count} Hour${count > 1 ? "s" : ""}`;
        timeout = timeUntilExpired % HR;
    } else {
        let count = Math.floor(timeUntilExpired / MIN);
        if (count === 0) {
            text = "Under 1 Minute";
        } else {
            text = `${count} Minute${count > 1 ? "s" : ""}`;
        }
        timeout = timeUntilExpired % MIN;
    }
    expiryLabel.textContent = text;
    //Snooze until next change, or 1 second delay to avoid rapid looping in an error state
    setTimeout(() => { runExpiryLabel(expiryTimestamp) }, Math.max(timeout, 1000));
}

//Configuration UI Handlers
const scheduleUnitTemplate = document.getElementById("scheduleUnitTemplate");
const scheduleSessionTemplate = document.getElementById("scheduleUnitSessionTemplate");
const scheduleContainer = document.getElementById("scheduleListHolder");

const linkTemplate = document.getElementById("linkTemplate")
const linkContainer = document.getElementById("linkListHolder");

const noteTemplate = document.getElementById("noteTemplate")
const noteContainer = document.getElementById("noteListHolder");

function renderConfigurationPanel() {
    renderSettingsPanel(configData.settings)
    renderSchedulePanel(configData.schedule);
    renderNotesPanel(configData.notes);
    renderLinksPanel(configData.links);
}

function renderSettingsPanel(settingData = {}) {

}

function renderSchedulePanel(scheduleData = []) {
    function renderScheduleInstance(data) {
        //Attach
        var fragment = scheduleUnitTemplate.content.cloneNode(true);
        var rootEl = fragment.firstElementChild;
        scheduleContainer.appendChild(fragment);
        //Set values
        let startInput = rootEl.querySelector(".scheduleStartInput");
        handleInput(startInput, data, "startTime");
        let endInput = rootEl.querySelector(".scheduleEndInput");
        handleInput(endInput, data, "endTime");
        let dateInput = rootEl.querySelector(".scheduleDateInput");
        handleInput(dateInput, data, "date");
        let noteInput = rootEl.querySelector(".scheduleNoteArea");
        handleInput(noteInput, data, "note");
        //Handle delete button
        let deleteButton = rootEl.querySelector("button.deletebtn");
        deleteButton.addEventListener("click", () => {
            if (!confirm("Delete this day? This cannot be undone")) {
                markModified();
                return;
            }
            let index = scheduleData.indexOf(data);
            scheduleData.splice(index, 1);
            rootEl.remove();
        });
        //Handle clone button
        let cloneButton = rootEl.querySelector("button.clonebtn");
        cloneButton.addEventListener("click", () => {
            let copiedData = JSON.parse(JSON.stringify(data));
            scheduleData.push(copiedData);
            markModified();
            renderScheduleInstance(copiedData);
        })

        function renderScheduleSessionInstance(sessionData) {
            var fragment = scheduleSessionTemplate.content.cloneNode(true);
            var sessionRootEl = fragment.firstElementChild;
            rootEl.querySelector(".scheduleUnitSessionHolder").appendChild(fragment);
            //Set values
            let startInput = sessionRootEl.querySelector(".scheduleSessionStartInput");
            handleInput(startInput, sessionData, "startTime");
            let endInput = sessionRootEl.querySelector(".scheduleSessionEndInput");
            handleInput(endInput, sessionData, "endTime");
            let dateInput = sessionRootEl.querySelector(".scheduleSessionLocationInput");
            handleInput(dateInput, sessionData, "location");
            let noteInput = sessionRootEl.querySelector(".scheduleSessionNoteArea");
            handleInput(noteInput, sessionData, "note");
            //Handle delete button
            let deleteButton = sessionRootEl.querySelector("button.deletebtn");
            deleteButton.addEventListener("click", () => {
                if (!confirm("Delete this session? This cannot be undone")) {
                    markChange();
                    return;
                }
                let index = data.sessions.indexOf(sessionData);
                data.sessions.splice(index, 1);
                sessionRootEl.remove();
            });
        }

        //Initial run of sub-sessions
        data['sessions'].forEach((session) => {
            renderScheduleSessionInstance(session);
        })

        //New session button
        rootEl.querySelector("button.scheduleNewSessionButton").onclick = function () {
            let newData = { startTime: null, endTime: null, location: "", note: "" };
            data.sessions.push(newData);
            markChange();
            renderScheduleSessionInstance(newData);
        };
    }

    //Initial run
    clearChildren(scheduleContainer);
    scheduleData.forEach((data) => {
        renderScheduleInstance(data);
    });

    //New Button
    document.getElementById("scheduleNewDayButton").onclick = function () {
        let newData = { startTime: null, endTime: null, date: null, note: "", sessions: [] };
        scheduleData.push(newData);
        markChange();
        renderScheduleInstance(newData);
    };
}

function renderNotesPanel(noteData = []) {
    function renderNoteInstance(data = {}) {
        //Attach
        var fragment = noteTemplate.content.cloneNode(true);
        var rootEl = fragment.firstElementChild;
        noteContainer.appendChild(fragment);
        //Handle inputs
        let nameInput = rootEl.querySelector(".nameInput");
        handleInput(nameInput, data, "name");
        let urlInput = rootEl.querySelector(".messageInput");
        handleInput(urlInput, data, "message");
    }

    //Initial run
    clearChildren(noteContainer);
    noteData.forEach((data) => {
        renderNoteInstance(data);
    });

    //New Button
    document.getElementById("newNoteButton").onclick = function () {
        var newData = { name: "", message: "" };
        noteData.push(newData);
        markChange();
        renderNoteInstance(newData);
    }
}

function renderLinksPanel(linkData = []) {
    function renderLinkInstance(data = {}) {
        //Attach
        var fragment = linkTemplate.content.cloneNode(true);
        var rootEl = fragment.firstElementChild;
        linkContainer.appendChild(fragment);
        //Handle inputs
        let nameInput = rootEl.querySelector(".nameInput");
        handleInput(nameInput, data, "name");
        let colorInput = rootEl.querySelector(".colorInput");
        handleInput(colorInput, data, "color");
        let urlInput = rootEl.querySelector(".urlInput");
        handleInput(urlInput, data, "url");
    }

    //Initial run
    clearChildren(linkContainer);
    linkData.forEach((data) => {
        renderLinkInstance(data);
    });

    //New Button
    document.getElementById("newLinkButton").onclick = function () {
        var newData = { name: "", url: "", color: null };
        linkData.push(newData);
        markChange();
        renderLinkInstance(newData);
    }
}

//Function to process any changes to inputs
function handleInput(inputObject, propertyLocation, propertyName) {
    inputObject.value = propertyLocation[propertyName];
    inputObject.addEventListener("change", () => {
        propertyLocation[propertyName] = inputObject.value;
        markChange();
    })
}

document.querySelectorAll("button.cancelAction").forEach((btn) => {
    btn.addEventListener("click", () => {
        hideDialog();
    })
})

function showDialog(dialogSection) {
    hideAllChildren(dialogContainer);
    dialogContainer.style.display = "block";
    dialogSection.style.display = "flex";
}

function hideDialog() {
    dialogContainer.style.display = "none";
    hideAllChildren(dialogContainer);
}

const spinner = document.querySelector(".masterSpinner");
function showSpinner() {
    hideAllChildren(dialogContainer);
    dialogContainer.style.display = "flex";
    spinner.style.display = "block";
}

function hideSpinner() {
    hideDialog();
}

function getCandidateName(sheetContainer, responseId) {
    if (sheetContainer.matching['Name']) {
        if (responseId === null) {
            return "(Empty)"
        }
        return sheetContainer.getResponse(responseId)?.getAnswer(sheetContainer.matching['Name']).getContent() ?? "Name Not Available";
    } else {
        return "Name Not Available";
    }
}