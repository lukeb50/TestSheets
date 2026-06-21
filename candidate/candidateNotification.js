const app = initFirebase();
const dataManagerInstance = new DataManager(getConnectionManager());
const indexedDbManagerInstance = new IndexedDbManager(INSTANCE_TYPE.CANDIDATE);

window.addEventListener("load", async () => {
    showSpinner();
    //Check parameters for a code
    var params = new URLSearchParams(window.location.search);
    var urlRegistrationCode = null;
    var dbRegistrationCode = null;
    if (params.has("code")) {
        urlRegistrationCode = params.get("code");
    }
    //Load a code from indexedDB
    try {
        let candidateStore = (await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.WRITE, "candidate")).getStore("candidate");
        let dbResult = await candidateStore.get("registration");
        if (dbResult && dbResult.expiry > Date.now()) {
            //Make sure this is still a valid registration
            dbRegistrationCode = dbResult;
        }
    } catch (err) {
        console.log(err);
    }
    //Chack that we have something to work off of
    if (!urlRegistrationCode && !dbRegistrationCode) {
        //No registration exists
        alert("Unable to load page. Please scan a valid QR code.");
        hideSpinner();
        return;
    }
    if (!dbRegistrationCode) {
        //URL Only
        //Show registration screen
        showRegistrationScreen(urlRegistrationCode);
    }
    if (!urlRegistrationCode) {
        //DB Only
        //TODO: Show messaging screen
    }
    if (urlRegistrationCode && dbRegistrationCode) {
        //Both
        if (urlRegistrationCode === dbRegistrationCode.registrationId) {
            //URL & DB match, there is no conflict
            //TODO: Show messaging screen
        } else {
            //Conflict, ask user
            if (confirm("You are trying to join a new class and will be removed from your existing class. Continue?")) {
                //Show registration screen
                showRegistrationScreen(urlRegistrationCode);
            } else {
                //Use DB value
                //TODO:Show messaging screen
            }
        }
    }
});

const candidateList = document.getElementById("candidateList");
const joinButton = document.getElementById("joinButton");

async function showRegistrationScreen(registrationId) {
    var registrationViewData;
    try {
        registrationViewData = await dataManagerInstance.getCommunicationCandidateView(registrationId);
    } catch (err) {
        alert("Unable to connect. Please check your connection and try again");
        return;
    } finally {
        hideSpinner();
    }
    clearChildren(candidateList);
    let buttons = [];
    registrationViewData.forEach(candidateEntry => {
        let btn = createElement("button", candidateList, candidateEntry.name, "");
        btn.setAttribute("data-id", candidateEntry.responseId);
        btn.disabled = candidateEntry.registered;
        buttons.push(btn);
        btn.onclick = function () {
            buttons.forEach((otherBtn) => {
                if (otherBtn !== btn) {
                    otherBtn.classList.remove("active");
                }
            });
            let isActive = btn.classList.toggle("active");
            joinButton.disabled = !isActive;
        }
    });
}

async function showMessagingScreen() {
    alert("Showing Messaging");
    hideSpinner();
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