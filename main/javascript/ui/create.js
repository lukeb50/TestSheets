/* global fetch, Promise, PDFLib, URL, autofills */

//Main screen lists
const lifesavingList = document.getElementById("mainLifesavingList");
const firstAidList = document.getElementById("mainFirstAidList");
const leadershipList = document.getElementById("mainLeadershipList");
const otherList = document.getElementById("mainOtherList");
const lists = { lifesaving: lifesavingList, firstAid: firstAidList, leadership: leadershipList, other: otherList };
const dialogContainer = document.getElementById("dialogContainer");
const sourceSelector = document.getElementById("sourceSelectorFrame");
//Source Dialog
const sourceDialog = document.getElementById("sourceDialog");
//Main Screen
const listScreen = document.getElementById("mainListContainer");
const matchingFrame = document.getElementById("matchingIFrame");
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

//Place skeletons
const template = document.getElementById("listSkeleton");
for (const [listName, listElement] of Object.entries(lists)) {
    for (var i = 0; i < 3; i++) {
        //let clone = template.content.cloneNode(true);
        //listElement.appendChild(clone);
        createSkeleton(template, listElement);
    }
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
            dialogContainer.style.display = "block";
            hideAllChildren(dialogContainer);
            sourceDialog.style.display = "flex";
            let SOURCE_CATEGORIES = sourceSelector.contentWindow.SOURCE_CATEGORIES;
            sourceSelector.contentWindow.getDataFromSource(selectedSheet, [SOURCE_CATEGORIES.ONLINE, SOURCE_CATEGORIES.EMPTY, SOURCE_CATEGORIES.FILE]).then(({ rawData, source }) => {
                //Generate matching
                let matchingEngine = new SourceMatchingEngine(rawData, selectedSheet.identifier, fieldData);
                let matchingData = matchingEngine.performMatching();
                //Build the object
                let newSheet = new SheetContainerBuilder().buildFromRaw(rawData, matchingData, selectedSheet.identifier);
                //Apply field modifications
                new FieldModificationSheetTransformer(newSheet, selectedSheet, fieldData).execute();
                if (newSheet.getNumberOfResponses() === 0 && !source.getAllowEmpty()) {
                    alert("The selection has no responses");
                    return;
                }
                listScreen.style.display = "none";
                matchingFrame.style.display = "block";
                matchingFrame.contentWindow.lastActiveSource = source;
                matchingFrame.contentWindow.showMatchingScreen(newSheet).catch((e) => {
                    console.log("Error on matching screen:", e);
                    matchingFrame.contentWindow.hideMatchingScreen();
                    matchingFrame.style.display = "none";
                    listScreen.style.display = "flex";
                });
            }).catch((e) => {
                console.log("Error getting data source:", e);
            }).finally(() => {
                dialogContainer.style.display = "none";
                hideAllChildren(dialogContainer);
            })
        };
    }
}

document.getElementById("cancelSourceDialogButton").onclick = function () {
    dialogContainer.style.display = "none";
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