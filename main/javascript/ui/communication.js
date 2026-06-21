const app = initFirebase();

const dataManagerInstance = new DataManager(getConnectionManager());

const mainPanel = document.getElementById("communicationMainPanel");
const splashPanel = document.getElementById("communicationSplashScreen");

const qrCodeCanvas = document.getElementById("qrImage");

const expiryLabel = document.getElementById("expiryTimeLabel");
const limitLabel = document.getElementById("qrCodeCandidateLimitLabel");
const qrCandidateList = document.getElementById("qrCandidateList");

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
    }).finally(() => {
        hideSpinner();
    })
})

async function renderMainPanel(sheetId, registrationInfo) {
    //Load sheet
    showSpinner();
    var sheetContainer;
    try {
        sheetContainer = (await dataManagerInstance.getSheetInstance(sheetId)).build();
    } catch (err) {
        console.log(err);
        alert("Unable to load");
        return;
    } finally {
        hideSpinner();
    }
    //QR code list
    renderQrList(sheetContainer);
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

async function renderQrList(sheetContainer) {
    qrListRefreshButton.disabled = true;
    //Skeletons
    clearChildren(qrCandidateList);
    for (let i = 0; i < (sheetContainer.getNumberOfResponses()); i++) {
        createSkeleton(template, qrCandidateList, true);
    }
    var candidateData;
    try {
        candidateData = await dataManagerInstance.getCommunicationRegisteredCandidates(sheetContainer.dbKey);
    } catch (err) {
        console.log(err);
        clearChildren(qrCandidateList);
        createElement("p", qrCandidateList, "Unable to load candidates", "qrListError");
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
        if (Object.keys(candidateData.candidates).includes(responseId)) {
            //Candidate is registered
            icon.textContent = "person_check";
            rootEl.classList.add("  ");
        } else if (candidateData.count < candidateData.max) {
            //Candidate not registered, still room
            icon.textContent = "person";
        } else {
            //Candidate not registered, no room
            icon.textContent = "person_off"
        }
    }

    //Adjust debounces
    qrListRefreshButton.onclick = function () {
        qrListRefreshButton.disabled = true;
        renderQrList(sheetContainer);
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
    if (timeUntilExpired > DAY) {
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