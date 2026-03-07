/* global fetch, Promise, PDFLib, URL, autofills */

//Main screen lists
const lifesavingList = document.getElementById("mainLifesavingList");
const firstAidList = document.getElementById("mainFirstAidList");
const leadershipList = document.getElementById("mainLeadershipList");
const otherList = document.getElementById("mainOtherList");
const lists = { lifesaving: lifesavingList, firstAid: firstAidList, leadership: leadershipList, other: otherList };
const dialogContainer = document.getElementById("dialogContainer");
//Source Dialog
const sourceDialog = document.getElementById("sourceDialog");
const sourceDialogPages = document.getElementById("sourceDialogSwipeDiv");
//Main Screen
const listScreen = document.getElementById("mainListContainer");
const matchingFrame = document.getElementById("matchingIFrame");
//Authentication
const authProvider = new AuthProvider();
//Data
var sheetData;
var fieldData;

// Initialize Firebase
const app = initFirebase();

const loggedOutControls = document.getElementById("topbarAccountSignUpHolder");
const loggedInControls = document.getElementById("topbarAccountLoggedInHolder");

//authentication handler
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        loggedOutControls.style.display = "none";
        loggedInControls.style.display = "block";
    } else {
        loggedOutControls.style.display = "block";
        loggedInControls.style.display = "none";
    }
});

document.getElementById("signOutButton").onclick = function () {
    logoutUser();
}

function redirectToLogin() {
    window.location.href = "login.html"
}

function redirectToHome() {
    window.location.href = "home.html"
}

//Place skeletons
const template = document.getElementById("listSkeleton");
for (const [listName, listElement] of Object.entries(lists)) {
    for (var i = 0; i < 3; i++) {
        let clone = template.content.cloneNode(true);
        listElement.appendChild(clone);
    }
}

//Hide test entry in production
if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1" && location.hostname !== "") {
    document.getElementById("testSource").style.display = "none";
}

window.onload = function () {
    //Load JSON files
    loadJsonFiles(dataFileNames.sheets, dataFileNames.fields).then((data) => {
        sheetData = data[dataFileNames.sheets];
        fieldData = data[dataFileNames.fields];
        initializeListings();
    }).catch((e) => {
        alert("Internal error. Please try again later");
        console.log(e);
    });
};
function initializeListings() {
    for (const [listName, listElement] of Object.entries(lists)) {
        let listSheetData = sheetData[listName];
        //Clear the list
        clearChildren(listElement);
        //Fill the list
        if (listSheetData.length === 0) {
            //No entries
            createElement("label", listElement, "No Options Available", "listNoOption");
        } else {
            //populate entries
            listSheetData.forEach((sheetEntry, i) => {
                let entryHolder = createElement("div", listElement, "", "listing");
                let entryDetailHolder = createElement("div", entryHolder, "", "");
                createElement("label", entryDetailHolder, sheetEntry.name, "listingTitle");
                createElement("label", entryDetailHolder, sheetEntry.descriptionText, "listingInfo");
                let entryButton = createElement("button", entryHolder, "Use", "listingButton");
                bindListingButton(entryButton, listName, i);
            });
        }
    }

    function bindListingButton(button, listName, listPosition) {
        button.onclick = function () {
            let selectedSheet = sheetData[listName][listPosition];
            getDataFromSource(selectedSheet).then((dataContainer) => {
                if (dataContainer.getNumberOfResponses() === 0) {
                    alert("The selection has no responses");
                    return;
                }
                dataContainer.matchQuestionFields();
                listScreen.style.display = "none";
                matchingFrame.style.display = "block";
                matchingFrame.contentWindow.showMatchingScreen(dataContainer, null).catch((e) => {
                    console.log("Error on matching screen:", e);
                    matchingFrame.contentWindow.hideMatchingScreen();
                    matchingFrame.style.display = "none";
                    listScreen.style.display = "flex";
                });
            }).catch((e) => {
                console.log("Error getting data source:", e);
            });
        };
    }
}

//Source select buttons
const googleFormsSourceBtn = document.getElementById("googleFormsSource");
const csvSourceBtn = document.getElementById("csvSource");
const testSourceBtn = document.getElementById("testSource");
//Source seconday pages
const googleFormsInputPage = document.getElementById("GoogleFormsInputPage");
const csvInputPage = document.getElementById("csvInputPage");
const testInputPage = document.getElementById("testInputPage");
const sourceOptions = [{ sourceName: "GoogleForms", button: googleFormsSourceBtn, inputPage: googleFormsInputPage },
{ sourceName: "csv", button: csvSourceBtn, inputPage: csvInputPage },
{ sourceName: "test", button: testSourceBtn, inputPage: testInputPage }
];
function getDataFromSource(selectedSheet) {
    hideAllChildren(dialogContainer);
    dialogContainer.style.display = "block";
    sourceDialog.style.display = "flex";
    sourceDialogPages.style.right = "0%";
    return new Promise((resolve, reject) => {
        sourceOptions.forEach((entry) => {
            bindSourceClick(entry);
        });
        function bindSourceClick(sourceData) {
            sourceData.button.onclick = function () {
                let sourceObject = new SourceFactory().getSourceOfType(sourceData.sourceName);
                sourceObject.setInformation(selectedSheet, fieldData);
                sourceObject.setAuthenticationProvider(authProvider);
                sourceObject.execute().then((dataContainer) => {
                    dialogContainer.style.display = "none";
                    resolve(dataContainer);
                }).catch((e) => {
                    dialogContainer.style.display = "none";
                    alert("Error: " + e);
                    reject(e);
                });
                sourceOptions.forEach((entry) => {
                    entry.inputPage.style.display = "none";
                });
                sourceData.inputPage.style.display = "block";
                sourceDialogPages.style.right = "100%";
            };
        }

        document.getElementById("cancelSourceDialogButton").onclick = function () {
            dialogContainer.style.display = "none";
            reject("User closed dialog");
        };
    });
}

const csvUpload = document.getElementById("csvUpload");
const csvLabel = document.getElementById("csvFilePickerFileName");
const csvConfirmBtn = document.getElementById("csvConfirmButton");

csvUpload.onchange = function () {
    let files = csvUpload.files;
    if (files.length === 1) {
        //1 File
        csvLabel.textContent = files[0].name;
        const regex = /^([a-zA-Z0-9\s_\\.\-\(\):])+(.csv)$/;
        if (regex.test(files[0].name)) {
            csvUpload.setAttribute("data-valid", true);
            csvConfirmBtn.disabled = false;
        } else {
            csvUpload.setAttribute("data-valid", false);
            csvConfirmBtn.disabled = true;
        }
    } else if (files.length === 0) {
        //No files
        csvLabel.textContent = "No file selected";
        csvUpload.setAttribute("data-valid", false);
        csvConfirmBtn.disabled = true;
    } else {
        csvLabel.textContent = "Invalid Selection";
        csvUpload.setAttribute("data-valid", false);
        csvConfirmBtn.disabled = true;
    }
};

const helpButton = document.getElementById("helpButton");
const helpDialog = document.getElementById("helpDialog");

helpButton.onclick = function () {
    hideAllChildren(dialogContainer);
    dialogContainer.style.display = "block";
    helpDialog.style.display = "flex";
};

document.getElementById("closeHelpDialogButton").onclick = function () {
    dialogContainer.style.display = "none";
}
    ;