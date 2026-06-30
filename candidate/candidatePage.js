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
        let candidateStore = (await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.READONLY, "candidate")).getStore("candidate");
        let dbResult = (await candidateStore.get("token"));
        if (dbResult) {
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
        showClassScreen(dbRegistrationCode);
    }
    if (urlRegistrationCode && dbRegistrationCode) {
        //Both
        if (urlRegistrationCode === dbRegistrationCode.registrationId) {
            //URL & DB match, there is no conflict
            showClassScreen(dbRegistrationCode);
        } else {
            //Conflict, ask user
            if (confirm("You are trying to join a new class and will be disconnected from your existing class. Continue?")) {
                //Show registration screen
                showRegistrationScreen(urlRegistrationCode);
            } else {
                //Use DB value
                showClassScreen(dbRegistrationCode);
            }
        }
    }
});

const verificationMethodSelect = document.getElementById("verificationMethodSelect");
const verificationInput = document.getElementById("verificationInput");
const verificationSubmitButton = document.getElementById("verificationSubmitButton");

const bypassCodeInput = document.getElementById("bypassCodeInput");
const bypassCodeSubmitButton = document.getElementById("bypassCodeSubmitButton");

const verificationHolder = document.getElementById("verificationHolder");

const joinHolder = document.getElementById("joinHolder");
const entryConfirmHolder = document.getElementById("entryConfirmHolder");

const bypassCodeHolder = document.getElementById("bypassCodeHolder");

const entryConfirmationNameLabel = document.getElementById("entryConfirmationNameLabel");
const entryConfirmationYesButton = document.getElementById("entryConfirmationYesButton");
const entryConfirmationNoButton = document.getElementById("entryConfirmationNoButton");

const verificationScreen = document.getElementById("splashContainer");
const classScren = document.getElementById("classContainer");

async function showRegistrationScreen(registrationId) {
    hideSpinner();
    hideAllChildren(verificationHolder);
    verificationScreen.style.display = "flex";
    classScren.style.display = "none";
    joinHolder.style.display = "block";
    verificationMethodSelect.onchange = methodChange;
    function methodChange() {
        verificationInput.maxLength = 200;
        verificationInput.value = "";
        verificationInput.dispatchEvent(new Event("input"));
        switch (verificationMethodSelect.value) {
            case "LSSId":
                verificationInput.type = "text";
                verificationInput.maxLength = "7";
                break;
            case "Email":
                verificationInput.type = "email";
                break;
            case "Phone":
                verificationInput.type = "tel";
                break;
        }
    }
    methodChange();//Apply for start

    verificationSubmitButton.onclick = async function () {
        showSpinner();
        try {
            let entryTokenData = await dataManagerInstance.getEntryToken(registrationId, verificationMethodSelect.value, verificationInput.value);
            handleEntryConfirmationScreen(entryTokenData);
        } catch (err) {
            switch (err.message) {
                case "403":
                    alert("Please make sure the URL/QR Code you have used is valid");
                    break;
                case "404":
                    alert("Invalid identification. Try again or ask your instructor for a bypass code.");
                    break;
                case "405":
                    //The sheet does not have data for this data type. Disable it.
                    alert(`Cannot verify with ${verificationMethodSelect.options[verificationMethodSelect.selectedIndex].textContent}. Please try a different identity type`);
                    verificationMethodSelect.options[verificationMethodSelect.selectedIndex].disabled = true;
                    //Force to a non-disabled option
                    const firstEnabledIndex = [...verificationMethodSelect.options].findIndex(option => !option.disabled);
                    if (firstEnabledIndex !== -1) {
                        verificationMethodSelect.selectedIndex = firstEnabledIndex;
                        methodChange();
                    } else {
                        //TODO:Force onto a bypass code
                    }
                    break;
                default:
                    alert("Unable to submit. Please try again later");
                    return;
            }
        } finally {
            verificationInput.value = "";
            hideSpinner();
        }
    }

    const verificationTcCheckbox = document.getElementById("verificationTcCheckbox");
    function setVerificationSubmitButtonState() {
        verificationSubmitButton.disabled = !(verificationTcCheckbox.checked && verificationInput.value.length > 0);
    }
    verificationInput.addEventListener("input", setVerificationSubmitButtonState);
    verificationTcCheckbox.addEventListener("change", setVerificationSubmitButtonState);

    document.getElementById("goToBypassButton").onclick = function () {
        hideAllChildren(verificationHolder);
        bypassCodeHolder.style.display = "block";
        bypassCodeInput.value = "";
        bypassTcCheckbox.checked = false;
        bypassCodeInput.dispatchEvent(new Event("input"));
    }

    bypassCodeSubmitButton.onclick = async function () {
        showSpinner();
        try {
            let authToken = await dataManagerInstance.getCandidateTokenWithBypass(registrationId, bypassCodeInput.value);
            let auxData = { name: authToken.candidateName };
            delete authToken.candidateName;
            await saveCandidateInformation(authToken, auxData);
            showClassScreen(authToken);
        } catch (err) {
            console.log(err);
            alert("Unable to use code");
        } finally {
            bypassCodeInput.value = "";
            hideSpinner();
        }
    }

    const bypassTcCheckbox = document.getElementById("bypassTcCheckbox");
    function setBypassSubmitButtonState() {
        bypassCodeSubmitButton.disabled = !(bypassTcCheckbox.checked && bypassCodeInput.value.length === 10);
    }
    bypassTcCheckbox.addEventListener("change", setBypassSubmitButtonState);
    bypassCodeInput.addEventListener("input", setBypassSubmitButtonState);

    async function handleEntryConfirmationScreen(entryTokenData) {
        hideAllChildren(verificationHolder);
        entryConfirmHolder.style.display = "block";
        entryConfirmationNameLabel.textContent = entryTokenData.name;
        //Wrap buttons in a promise to act on first input
        new Promise((resolve, reject) => {
            entryConfirmationYesButton.onclick = resolve;
            entryConfirmationNoButton.onclick = reject;
        }).then(async () => {
            //Attempt to exchange for a candidate token
            showSpinner();
            try {
                let authToken = await dataManagerInstance.getCandidateToken(registrationId, entryTokenData);
                let auxData = { name: entryTokenData.name };
                await saveCandidateInformation(authToken, auxData);
                showClassScreen(authToken);
            } catch (err) {
                //Server error
                console.log(err);
                alert("Unable to register");
                hideAllChildren(verificationHolder);
                joinHolder.style.display = "block";
            } finally {
                hideSpinner();
            }
        }).catch((err) => {
            //User pressed "No" button, return to the input screen
            hideAllChildren(verificationHolder);
            joinHolder.style.display = "block";
        })
    }
}

async function saveCandidateInformation(token, auxData) {
    try {
        let candidateStore = (await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.WRITE, "candidate")).getStore("candidate");
        await candidateStore.put(token, "token");
        await candidateStore.put(auxData, "information");
        return true;
    } catch (err) {
        console.log(err);
        return false;
    }
}

const nameLabel = document.getElementById("nameLabel");
async function showClassScreen(authToken) {
    var configData = await dataManagerInstance.getCandidateConfiguration(authToken);
    hideSpinner();
    verificationScreen.style.display = "none";
    classScren.style.display = "flex";
    //Load the name from the database
    let candidateStore = (await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.WRITE, "candidate")).getStore("candidate");
    let userInfo = (await candidateStore.get("information"));
    nameLabel.textContent = userInfo.name;

    document.getElementById("signOutButton").addEventListener("click", async (e) => {
        e.stopImmediatePropagation(); // Prevents any other listeners from running
        if (confirm("Sign out? You will need to re-register using the QR code provided by your instructor")) {
            let candidateStore = (await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.WRITE, "candidate")).getStore("candidate");
            candidateStore.delete("token");
            candidateStore.delete("information");
            await dataManagerInstance.revokeCandidateToken(authToken);
            window.location.reload();
        }
    }, { capture: true });
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