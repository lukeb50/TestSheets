var fieldData;
var sheetData;

//Remembers information filled out for affiliate, instructor, examiner, etc.
var courseInfoObj = null;

const matchingTable = document.getElementById("mainSelectionTable");
const matchingConfirmBtn = document.getElementById("confirmSelectionTableBtn");
const matchingSelectedCountLabel = document.getElementById("mainSelectionCountLabel");
const matchingSheetInfoLabel = document.getElementById("mainSelectionSheetLabel");
const matchingTableHolder = document.getElementById("mainSelectionTableHolder");

const warningBar = document.getElementById("mainSelectionWarningBar");
const warningPreviousBtn = document.getElementById("warningPreviousBtn");
const warningPageLabel = document.getElementById("warningPageLabel");
const warningNextBtn = document.getElementById("warningNextBtn");

const filterMenu = document.getElementById("filterMenu");
const filterSelect = document.getElementById("filterOptionSelect");
const filterInput = document.getElementById("filterInput");
const filterApplyBtn = document.getElementById("filterApplyButton");
const filterCancelBtn = document.getElementById("filterCancelButton");

//CourseInfoDialog
const courseInfoDialog = document.getElementById("courseInfoDialog");
const courseInfoDialogPages = document.getElementById("courseInfoDialogSwipeDiv");

//Main Screen
const tableScreen = document.getElementById("MainSelectionContainer");

//Inits

var dataContainer = null;
var selectedSheet = null;

var miscData = {};

const app = initFirebase();

const dataManagerInstance = new DataManager(getConnectionManager());

const loggedOutControls = document.getElementById("topbarAccountSignUpHolder");
const loggedInControls = document.getElementById("topbarAccountLoggedInHolder");

saveExecuteFn = (async () => {
    await dataManagerInstance.saveSheetInstance(dataContainer);
})

allowSave = (() => {
    return dataContainer && dataContainer.dbKey && firebase.auth().currentUser !== null;
})

var firstFail = true;
onSaveFail = (() => {
    if (firstFail) {//Only alert on first failure. A successful save will clear this flag.
        alert("Error saving");
        firstFail = false;
    }
    setSaveIndicatorInternal(SAVE_STATUS.UNSAVED);
});

onSaveSuccess = (() => {
    setSaveIndicatorInternal(dataContainer.saveStatus);
    firstFail = true;
})

onSaveStart = (() => {
    setSaveIndicatorInternal(SAVE_STATUS.SAVING);
})

onChange = (() => {
    dataContainer.markModified();
})

const saveLabelHolder = document.getElementById("isSavedHolder");

function setSaveIndicatorInternal(saveStatus) {
    setSaveIndicator(saveStatus);
    if (!firebase.auth().currentUser) {
        saveCommitButton.style.display = "";
        saveLabelHolder.style.display = "";
        return;
    }
    switch (saveStatus) {
        case SAVE_STATUS.INITIAL:
        case SAVE_STATUS.INITIAL_UNSAVED:
            saveCommitButton.style.display = "inline";
            saveLabelHolder.style.display = "none";
            break;
        case SAVE_STATUS.SAVING:
            break;
        case SAVE_STATUS.SERVER_SAVED:
        case SAVE_STATUS.LOCAL_SAVED:
        case SAVE_STATUS.UNSAVED:
            saveCommitButton.style.display = "none";
            saveLabelHolder.style.display = "inline";
            break;
    }
}

const saveBroadcastChannel = new BroadcastChannel('TEST_SHEETS/OFFLINE_SAVE_EVENT');
saveBroadcastChannel.onmessage = ((event) => {
    let eventInfo = event.data;
    if (eventInfo.type !== "sheet") {
        return;
    }
    if (!dataContainer) {
        return;
    }
    if (!Array.isArray(eventInfo.key) && eventInfo.key === dataContainer.dbKey) {
        //This signal is for the currently displayed toolkit
        setSaveIndicator(SAVE_STATUS.SERVER_SAVED);
    }
})

function showLoginPopup() {
    window.open("login.html?close=true", "_blank", "width=400,height=400");
}

async function redirectToHome() {
    forceSave();
    window.parent.location.href = "home.html"
}

async function redirectToCreate() {
    forceSave();
    window.parent.location.href = "create.html"
}

async function signOut() {
    await forceSave();
    logoutUser();
    redirectToCreate();
}


window.addEventListener("load", function () {
    //Load JSON files
    loadJsonFiles(dataFileNames.fields, dataFileNames.sheets).then(async (data) => {
        fieldData = data[dataFileNames.fields];
        sheetData = data[dataFileNames.sheets];
        var user = await awaitUserLoad();
        if (user) {
            //Check if sent from home screen
            var params = new URLSearchParams(window.location.search);
            if (params.has("id")) {
                //Load an existing sheet 
                var sheetId = params.get("id");
                var responseBuilder = await dataManagerInstance.getSheetInstance(sheetId);
                responseBuilder.setFieldData(fieldData).setSheetInformation(sheetData);
                dataContainer = responseBuilder.build();
                document.getElementById("cancelSelectionTableBtn").style.display = "none";
                showMatchingScreen(dataContainer);
            }
        }
    }).catch((e) => {
        alert("Internal error. Please try again later");
        console.log(e);
    });
});

const saveActionsHolder = document.getElementById("saveHolder");
//authentication handler
firebase.auth().onAuthStateChanged(async (user) => {
    setSaveIndicatorInternal(null);
    if (user) {
        saveActionsHolder.style.display = "flex";
        setSaveIndicatorInternal(dataContainer?.saveStatus ?? SAVE_STATUS.INITIAL_UNSAVED);
        loggedOutControls.style.display = "none";
        loggedInControls.style.display = "block";
    } else {
        saveActionsHolder.style.display = "none";
        loggedOutControls.style.display = "block";
        loggedInControls.style.display = "none";
    }
});

//Save UI handlers
const saveNameInput = document.getElementById("saveNameInput");
const saveCommitButton = document.getElementById("notSavedSaveButton");

saveCommitButton.onclick = async function () {
    saveCommitButton.style.display = "none";
    dataContainer.assignKey();
    markChange();
    forceSave();
}

saveNameInput.addEventListener("change", () => {
    dataContainer.label = saveNameInput.value
    markChange();
});

function showMatchingScreen(sheetContainer) {
    dataContainer = sheetContainer;
    selectedSheet = sheetContainer.sheetInformation;
    miscData = {};
    miscData['verificationModules'] = [new ageVerificationModule()];
    //Run an inital verification
    miscData['verificationModules'].forEach((module) => {
        module.runVerification(dataContainer, selectedSheet);
    });
    //UI resets
    setSaveIndicatorInternal(dataContainer.saveStatus)
    saveNameInput.value = dataContainer.label;
    matchingSheetInfoLabel.textContent = selectedSheet.name + " - " + selectedSheet.descriptionText;
    dialogContainer.style.display = "none";
    warningBar.removeAttribute("data-module");
    clearChildren(matchingTable);
    //Variables
    miscData['selectedResponses'] = [];
    miscData['filteredResponses'] = Object.keys(dataContainer.getResponses());
    miscData['appliedFilters'] = {};
    //Create header row
    let headerRow = createElement("tr", matchingTable, "", "");
    let allSelectBox = createElement("th", headerRow, "", "");
    //Master "check all"
    let allSelectCheckbox = createElement("input", allSelectBox, "", "");
    allSelectCheckbox.id = "matchingSelectAll";
    //Set proper state if re-rendering
    allSelectCheckbox.checked = true;
    allSelectCheckbox.type = "checkbox";
    allSelectCheckbox.onchange = handleSelectAllCheckboxChanged;
    let allLbl = createElement("label", allSelectBox, "Select All", "");
    allLbl.setAttribute("for", "matchingSelectAll");
    //Create question dropdowns
    dataContainer.includedQuestions.forEach((questionId) => {
        if (dataContainer.excludedFields.indexOf(dataContainer.getFieldNameFromQuestionId(questionId)) === -1) {
            let header = createElement("th", headerRow, "", "");
            let headerSpan = createElement("span", header, "", "");
            let questionSelector = createElement("select", headerSpan, "", "");
            fillSelector(questionSelector, questionId);
            questionSelector.setAttribute("data-question", questionId);
            questionSelector.className = "matchingSelect";
            questionSelector.onchange = handleSelectChanged;
            let matchResult = dataContainer.getFieldNameFromQuestionId(questionId);
            if (matchResult) {
                questionSelector.value = matchResult;
                questionSelector.setAttribute("data-val", matchResult);
            } else {
                questionSelector.value = "";
                questionSelector.setAttribute("data-val", "");
            }
            //Filter button
            let filterButton = createElement("button", headerSpan, "filter_alt", "material-symbols-outlined filterButton");
            filterButton.setAttribute("data-question", questionId);
            handleFilterButtonClick(filterButton);
        }
    });
    //Call function to disable options as required
    handleSelectChanged();
    //Create button to add column
    let newColumnButtonHolder = createElement("th", headerRow, "", "");
    let newColumnButton = createElement("button", newColumnButtonHolder, "+", "");
    newColumnButton.title = "Add manual field";
    newColumnButton.onclick = function () {
        //Add the new column to the dataContainer
        let newQuestionId = dataContainer.addEmptyAnswer()
        markChange();
        console.log(newQuestionId)
        //Create the select
        let newSelectHeader = createElement("th", headerRow, "", "");
        let newSelectSpan = createElement("span", newSelectHeader, "", "");
        //Insert properly
        headerRow.insertBefore(newSelectHeader, newColumnButtonHolder);
        let questionSelector = createElement("select", newSelectSpan, "", "");
        //Fill the select & bind
        fillSelector(questionSelector, newQuestionId);
        questionSelector.setAttribute("data-question", newQuestionId);
        questionSelector.className = "matchingSelect";
        questionSelector.onchange = handleSelectChanged;
        questionSelector.setAttribute("data-val", "");
        handleSelectChanged();
        //Filter button
        let filterButton = createElement("button", newSelectSpan, "filter_alt", "material-symbols-outlined filterButton");
        filterButton.setAttribute("data-question", newQuestionId);
        handleFilterButtonClick(filterButton);
        //Create the new input boxes
        for (const [responseId, response] of Object.entries(dataContainer.getResponses())) {
            let responseRow = document.getElementById("matchingTableRow" + responseId);
            let newInputHolder = createElement("td", responseRow, "", "");
            responseRow.insertBefore(newInputHolder, document.getElementById("matchingTableEmpty" + responseId));
            let answerInput = createElement("input", createElement("span", newInputHolder, "", ""), "", "");
            answerInput.setAttribute("data-response", responseId);
            answerInput.setAttribute("data-question", newQuestionId);
            answerInput.onchange = handleInputUpdate;
            answerInput.value = response.getAnswer(newQuestionId).answerContent;
        }
    };
    //Create main table
    var currentCount = 1;
    for (const [responseId, response] of Object.entries(dataContainer.getResponses())) {
        miscData['selectedResponses'].push(responseId);
        createRow(responseId, response, currentCount);
        currentCount++;
    }
    //Update label
    updateCountLabel();
    //Show the autofill buttons as needed
    handleAutofillButtons();
    //Show warnings (verification ran at top of function)
    showWarningBar(null);
    //Call function so that select options are properly disabled
    handleSelectChanged();
    //Show filter buttons
    handleShowFilterButtons();
    //Create new response button
    let manualButton = createElement("Button", matchingTable, "Add Response", "");
    manualButton.id = "mainSelectionTableManualResponseBtn";
    manualButton.onclick = async function () {
        let responseId = await dataContainer.addEmptyResponse();
        markChange();
        let response = dataContainer.getResponse(responseId);
        miscData['selectedResponses'].push(responseId);
        miscData['filteredResponses'].push(responseId);//Update so that Select All works properly
        let createdRow = createRow(responseId, response, currentCount);
        matchingTable.insertBefore(createdRow, manualButton);
        currentCount++;
        updateCountLabel();
        handleShowFilterButtons();
    };
    return new Promise((resolve, reject) => {
        document.getElementById("cancelSelectionTableBtn").onclick = async function () {
            await forceSave();
            redirectToCreate();
        };

        matchingConfirmBtn.onclick = function () {
            forceSave();//non-await as user is staying on page
            let containerResponseKeys = Object.keys(dataContainer.getResponses());
            miscData['selectedResponses'].sort((a, b) => {
                return containerResponseKeys.indexOf(a) - containerResponseKeys.indexOf(b);
            });
            dataContainer.splitDividedFields();
            dataContainer.mergeCombinedFields();
            getCourseInformation().then((courseInfo) => {
                courseInfoObj = courseInfo;
                clearChildren(downloadList);
                courseInfoDialogPages.style.right = "100%";
                generatePdfFile(selectedSheet, dataContainer, miscData['selectedResponses'], courseInfo).then((files) => {
                    courseInfoDialogPages.style.right = "200%";
                    showDownloadPage(files, selectedSheet);
                }).catch((e) => {
                    dialogContainer.style.display = "none";
                    alert("Error generating Pdf files, please try again later");
                });
            });
        };
    });
}

function createRow(responseId, response, currentCount) {
    var excludedFields = dataContainer.excludedFields;
    let row = createElement("tr", matchingTable, "", "");
    row.id = "matchingTableRow" + responseId;
    row.setAttribute("data-response", responseId);
    let controlBox = createElement("td", row, "", "");
    //Create checkbox
    let controlBoxCheckbox = createElement("input", controlBox, "", "");
    controlBoxCheckbox.setAttribute("data-response", responseId);
    controlBoxCheckbox.type = "checkbox";
    controlBoxCheckbox.checked = miscData['selectedResponses'].includes(responseId);
    controlBoxCheckbox.setAttribute("data-response", responseId);
    controlBoxCheckbox.id = "matchingSelect-" + responseId;
    controlBoxCheckbox.onchange = handleCheckboxChanged;
    //Create label
    let lbl = createElement("label", controlBox, `Response ${currentCount}`, "");
    lbl.setAttribute('for', "matchingSelect-" + responseId);
    //Delete button
    let delBtn = createElement("button", controlBox, "delete", "deleteButton material-symbols-outlined");
    delBtn.addEventListener('click', () => {
        if (confirm(`Delete response ${currentCount}?`)) {
            row.remove();
            dataContainer.removeResponse(responseId);
            markChange();
        }
    })
    //Create question boxes
    dataContainer.includedQuestions.forEach((questionId) => {
        //Don't show any fields that are used for split/combine
        if (excludedFields.indexOf(dataContainer.getFieldNameFromQuestionId(questionId)) === -1) {
            let answerObj = response.getAnswer(questionId);
            //Create a td and span to contain the input
            let tdHolder = createElement("td", row, "", "");
            let answerInput = createElement("input", createElement("span", tdHolder, "", ""), "", "");
            answerInput.setAttribute("data-response", responseId);
            answerInput.setAttribute("data-question", questionId);
            answerInput.onchange = handleInputUpdate;
            answerInput.value = answerObj.answerContent;
        }
    });
    //Create blank box for new column button col
    createElement("td", row, "", "").id = "matchingTableEmpty" + responseId;
    return row;
}

function handleSelectChanged(e) {
    let selectors = Array.from(document.getElementsByClassName("matchingSelect"));
    //Updating matching table
    if (e) {
        selectors.forEach((el) => {
            var originalValue = el.getAttribute("data-val");
            if (el.value !== originalValue) {
                if (originalValue) {//Had an old value, clear it from matching
                    delete dataContainer.matching[originalValue];
                    markChange();
                }
                //If the select has a value, set it in the matching object
                if (el.value) {
                    dataContainer.matching[el.value] = el.getAttribute("data-question")
                    markChange();
                }
                //Set the "new" current value for future runs
                el.setAttribute("data-val", el.value);
            }
        });
    }
    //Enable/disable options
    let selectedFields = Object.keys(dataContainer.matching);
    selectors.forEach((el) => {
        for (const opt of el.children) {
            if (opt.value === "" || !selectedFields.includes(opt.value) || el.value === opt.value) {
                opt.disabled = false;
            } else {
                opt.disabled = true;
            }
        }
    });
    handleAutofillButtons();
    showWarningBar();
}

//Handle when user updates a value
function handleInputUpdate(e) {
    let target = e.target;
    let responseId = target.getAttribute("data-response");
    let questionId = target.getAttribute("data-question");
    dataContainer.getResponse(responseId).getAnswer(questionId).answerContent = target.value
    markChange();
    handleAutofillButtons();
    //Re-run each verification module if affected
    //Determine the name of the field being modified
    var selectedFieldMatching = dataContainer.getFieldNameFromQuestionId(questionId);
    if (selectedFieldMatching) {
        showWarningBar(selectedFieldMatching);
    }
    handleShowFilterButtons();
}

//Handle when the user clicks the "Select All" checkbox
function handleSelectAllCheckboxChanged(e) {
    let newState = e.target.checked;
    miscData['filteredResponses'].forEach((responseId) => {
        let check = document.getElementById("matchingSelect-" + responseId);
        check.checked = newState;
        if (newState === true) {
            if (!miscData['selectedResponses'].includes(responseId)) {
                miscData['selectedResponses'].push(responseId);
            }
        } else if (miscData['selectedResponses'].includes(responseId)) {
            //Remove if in the array
            miscData['selectedResponses'].splice(miscData['selectedResponses'].indexOf(responseId), 1);
        }
    });
    updateCountLabel();
}

//Handle when a user checks a checkbox
function handleCheckboxChanged(e) {
    //Handle changes to array
    let target = e.target;
    let responseId = target.getAttribute("data-response");
    if (target.checked === true) {
        if (!miscData['selectedResponses'].includes(responseId)) {
            miscData['selectedResponses'].push(responseId);
        }
    } else {
        if (miscData['selectedResponses'].includes(responseId)) {
            miscData['selectedResponses'].splice(miscData['selectedResponses'].indexOf(responseId), 1);
        }
    }
    //Update the label
    updateCountLabel();
    //Update the select all checkbox
    updateSelectAllCheckBox();
}

function updateSelectAllCheckBox() {
    var allSelectCheckbox = document.getElementById("matchingSelectAll");
    if (miscData['filteredResponses'].every((el) => miscData['selectedResponses'].includes(el))) {
        allSelectCheckbox.checked = true;
    } else {
        allSelectCheckbox.checked = false;
    }
}

//Updates the label next to state buttons
function updateCountLabel() {
    let count = miscData['selectedResponses'].length;
    matchingSelectedCountLabel.textContent = (count > 0 ? count : "No") + " Responses Included";
    matchingConfirmBtn.disabled = count === 0;
}

//Helper function to fill question field selectors
function fillSelector(selector, questionId) {
    fields = dataContainer.getFullFieldsList();
    createElement("option", selector, "", "").value = "";
    fields.forEach((fieldName) => {
        var txt = fieldData[fieldName]['Display']['English'];
        //If a field is flagged as being a prereq date/location, swap in the name of the prereq
        if (fieldData[fieldName]['Display']['prerequisiteDisplayFlag']) {
            let prereqIndex = parseInt(fieldName.match(/[0-9]/)[0]) - 1;
            txt = txt.replace("<name>", selectedSheet['prerequisites']['courses'][prereqIndex]);
        }
        let opt = createElement("option", selector, txt, "");
        opt.value = fieldName;
    });
}

function handleAutofillButtons() {
    //Clear all existing buttons
    document.querySelectorAll("button.autofillButton").forEach((btn) => {
        btn.remove();
    });
    //Go through each field, find if it has autocomplete options
    dataContainer.getFullFieldsList().forEach((field) => {
        if (fieldData[field].Autofill) {
            var responsesWithAutofill = [];
            //For each autofill combination, check if fields are assigned
            var selectedFields = Object.keys(dataContainer.matching);
            fieldData[field].Autofill.forEach((autofillCombination) => {
                //Check if all required fields are assigned
                if (autofillCombination.every(val => selectedFields.includes(val))) {
                    //All required fields are assigned
                    //For each response, check if the field to autocomplete is empty
                    for (const [responseId, response] of Object.entries(dataContainer.getResponses())) {
                        let autofillFieldQuestionId = dataContainer.matching[field];
                        let answer = response.getAnswer(autofillFieldQuestionId);
                        if (!answer || answer.answerContent.length === 0 || answer.answerContent === "") {
                            //The field to autocomplete is empty, check if the required fields have content
                            var isValid = true;
                            autofillCombination.forEach((combinationField) => {
                                let fieldId = dataContainer.matching[combinationField];
                                let fieldContents = response.getAnswer(fieldId).answerContent;
                                if (!fieldContents || fieldContents.length === 0 || fieldContents === "") {
                                    isValid = false;
                                }
                            });
                            if (isValid === true) {
                                //Signal that this field in this response can be autofilled
                                responsesWithAutofill.push(responseId);
                            }
                        }
                    }
                    ;
                }
            });
            //For this field, show autofill buttons
            let fieldId = dataContainer.matching[field];
            responsesWithAutofill.forEach((responseId) => {
                let inputElement = document.querySelector('input[data-response="' + responseId + '"][data-question="' + fieldId + '"]');
                if (inputElement) {
                    let autofillButton = createAutofillButton(inputElement);
                    handleAutofillButtonClick(autofillButton, responseId, fieldId, field);
                }
            });
        }
    });

    function handleAutofillButtonClick(button, responseId, questionId, fieldName) {
        button.onclick = function () {
            //Pick which autofill to use
            var chosenOption = 0;
            if (fieldData[fieldName].Autofill.length > 1) {
                //TODO: implement choosing which autofill to use
            }
            var autofillOptionToUse = fieldData[fieldName].Autofill[chosenOption];
            //find the autofill option in function registry
            for (var a = 0; a < autofills[fieldName].length; a++) {
                //first check, do lengths match
                if (autofills[fieldName][a].RequiredFields.length === autofillOptionToUse.length) {
                    //check if each element matches
                    if (autofills[fieldName][a].RequiredFields.every(val => autofillOptionToUse.includes(val))) {
                        //Call the funtion to get autofill data
                        button.disabled = true;
                        var inputField = document.querySelector('input[data-response="' + responseId + '"][data-question="' + questionId + '"]');
                        inputField.disabled = true;
                        autofills[fieldName][a].function(dataContainer, responseId).then((autofilledValue) => {
                            inputField.value = autofilledValue;
                            inputField.disabled = false;
                            dataContainer.getResponse(responseId).getAnswer(questionId).answerContent = autofilledValue
                            markChange();
                            button.remove();
                        }).catch((err) => {
                            console.log("Error with autofill: " + err);
                            alert("Autofill failed with reason: " + err);
                            button.disabled = false;
                            inputField.disabled = false;
                        });
                        //Don't check further
                        break;
                    }
                }
            }
        };
    }

    function createAutofillButton(inputField) {
        let parentSpan = inputField.parentElement;
        let btn = createElement("button", parentSpan, "online_prediction", "material-symbols-outlined autofillButton");
        btn.title = "Autofill Information";
        return btn;
    }
}

//restrictedField will only run verification modules tied to a field name. Useful when processing updates to data
function showWarningBar(restrictedField) {
    document.querySelectorAll("input.warningActive").forEach((el) => {
        el.classList.remove("warningActive");
    });
    miscData['verificationModules'].forEach((module) => {
        //Check if the verifier is responsible for this field
        if (!restrictedField || (restrictedField && module.getFieldName() === restrictedField)) {
            //Run verifier
            module.runVerification(dataContainer, selectedSheet);
            //Highlight inputs
            var fieldId = dataContainer.matching[module.getFieldName()];
            module.activeWarnings.forEach((responseId) => {
                let input = document.querySelector('input[data-response="' + responseId + '"][data-question="' + fieldId + '"]');
                if (input) {
                    input.classList.add("warningActive");
                }
            });
        }
    });
    let numberOfWarnings = miscData['verificationModules'].reduce((acc, module) => acc + module.activeWarnings.length === 0 ? 0 : 1, 0);
    if (numberOfWarnings > 0) {
        if (!warningBar.hasAttribute("data-module")) {
            let firstModule = miscData['verificationModules'].find((module) => module.activeWarnings.length > 0);
            warningBar.setAttribute("data-module", firstModule.constructor.name);
        }
        warningBar.style.display = "flex";
        //Pick the appropriate module and display it
        let module = miscData['verificationModules'].find((module) => module.constructor.name === warningBar.getAttribute("data-module"));
        module.setWarningBar(selectedSheet);
        let currentIndex = miscData['verificationModules'].indexOf(module);
        warningPageLabel.textContent = (currentIndex + 1) + " / " + numberOfWarnings;
        warningPreviousBtn.disabled = numberOfWarnings === 1;
        warningNextBtn.disabled = numberOfWarnings === 1;
    } else {
        warningBar.style.display = "none";
    }
}

//Handles showing or hiding filter buttons
function handleShowFilterButtons() {
    //Hide all buttons
    document.querySelectorAll(".filterButton").forEach((btn) => {
        btn.style.display = "none";
    });
    if (dataContainer.getNumberOfResponses() >= 10) {
        //var answerSets = {};
        //var blankCounts = {};
        dataContainer.includedQuestions.forEach((questionId) => {
            var btn = document.querySelector('.filterButton[data-question="' + questionId + '"]');
            if (btn) {
                btn.style.display = "block";
            }
        });
    }
}

function handleFilterButtonClick(btn) {
    btn.onclick = function () {
        filterMenu.style.display = "flex";
        if (miscData['appliedFilters'][btn.getAttribute("data-question")]) {
            let filterSettings = miscData['appliedFilters'][btn.getAttribute("data-question")];
            filterSelect.value = filterSettings.method;
            filterInput.value = filterSettings.value;
        } else {
            filterSelect.value = "equalTo";
            filterInput.value = "";
        }
        let menuBounds = filterMenu.getBoundingClientRect();
        positionMenu();
        new Promise((resolve, reject) => {
            matchingTableHolder.onscroll = function () {
                positionMenu();
            };

            filterApplyBtn.onclick = function () {
                let newConfig = {};
                newConfig.method = filterSelect.value;
                newConfig.value = filterInput.value;
                miscData['appliedFilters'][btn.getAttribute("data-question")] = newConfig;
                btn.classList.add("active");
                hideMenu();
                applyFilters();
                resolve();
            };

            filterCancelBtn.onclick = function () {
                delete miscData['appliedFilters'][btn.getAttribute("data-question")];
                btn.classList.remove("active");
                hideMenu();
                applyFilters();
                reject();
            };

            window.onclick = function (e) {
                if (!matchingTableHolder.contains(e.target) && !filterMenu.contains(e.target)) {
                    //Click outside the table area, hide the menu
                    hideMenu();
                    reject();
                }
            };

            btn.onclick = function () {
                hideMenu();
                reject();
            };
        });

        function hideMenu() {
            filterMenu.style.display = "none";
            handleFilterButtonClick(btn);
        }

        function positionMenu() {
            let buttonBounds = btn.getBoundingClientRect();
            filterMenu.style.top = (buttonBounds.bottom) + 10 + "px";
            filterMenu.style.left = (buttonBounds.right - menuBounds.width) + "px";
        }
    };
}

function applyFilters() {
    miscData['filteredResponses'] = Object.keys(dataContainer.getResponses());
    var filteredFields = Object.keys(miscData['appliedFilters']);
    if (filteredFields.length > 0) {
        for (const [responseId, response] of Object.entries(dataContainer.getResponses())) {
            filteredFields.forEach((fieldName) => {
                //Go through all filtered fields in each response
                let answerContent = response.getAnswer(fieldName).answerContent;
                let filterData = miscData['appliedFilters'][fieldName];
                if (!applyOperation(answerContent, filterData.method, filterData.value)) {
                    //Value failed filter test
                    var responseIndex = miscData['filteredResponses'].indexOf(responseId);
                    if (responseIndex !== -1) {
                        //Remove from list
                        miscData['filteredResponses'].splice(responseIndex, 1);
                    }
                }
            });
        }
    }
    //Update visibilities
    Object.keys(dataContainer.getResponses()).forEach((responseId) => {
        let rowEl = document.getElementById("matchingTableRow" + responseId);
        rowEl.style.display = miscData['filteredResponses'].indexOf(responseId) === -1 ? "none" : "table-row";
    });
    //Update the select all checkbox
    updateSelectAllCheckBox();

    function applyOperation(value, operation, filterValue) {
        switch (operation) {
            case "equalTo":
                return prepString(value.toString()) === prepString(filterValue.toString());
            case "greaterThan":
                return value > filterValue;
            case "lessThan":
                return value < filterValue;
            case "contains":
                return prepString(value.toString()).includes(prepString(filterValue));
            default:
                return false;
        }

        function prepString(str) {
            return str.toUpperCase().trim();
        }
    }
}

const filePath = "../pdfFiles/";
function generatePdfFile(sheetData, dataContainer, selectedResponses, courseInfo) {
    return new Promise(async (resolve, reject) => {
        var finishedFiles = [];
        //Load the PDF file
        try {
            console.log(sheetData.documentUrl);
            var response = await fetch(filePath + sheetData.documentUrl);
        } catch (e) {
            reject(e);
            return;
        }
        var loadedPdfBytes = await response.arrayBuffer();
        var loadedPdfDoc = await PDFLib.PDFDocument.load(loadedPdfBytes);
        let numberOfSelectedResponses = selectedResponses.length;
        var hasUniquePages = sheetData['repeatingPages'] ? true : false;
        let totalPageCount = (() => {//TODO: modify to account for uniques
            let count = 0;
            let pageCount = 0;
            while (count < numberOfSelectedResponses) {
                count += sheetData.pageSlotCounts[pageCount % sheetData.pageSlotCounts.length];
                pageCount++;
                if (hasUniquePages && pageCount !== 0 && pageCount % sheetData.pageSlotCounts.length === 0) {//Only do an initial run for all pages if uniques exist
                    break;
                }
            }
            if (hasUniquePages) {
                while (count < numberOfSelectedResponses) {
                    for (var i = 0; i < sheetData.repeatingPages.length; i++) {
                        count += sheetData.pageSlotCounts[sheetData.repeatingPages[i]];
                        pageCount++;
                        if (count >= numberOfSelectedResponses) {
                            break;
                        }
                    }
                }
            }
            return pageCount;
        })();
        var count = 1;//current response, 1-based
        var currentPage = 0; //current page in the PDF file, 0-based
        var currentOverallPage = 0; //current total page, 0-based
        var currentDocSlot = 1; //current response slot in the pdf file, 1-based
        var isFirstRun = true; //If this is the first PDF file, boolean
        var formObject = loadedPdfDoc.getForm();
        while (count <= numberOfSelectedResponses) {
            //Handle a single page
            for (x = 0; x < sheetData.pageSlotCounts[currentPage] && count <= numberOfSelectedResponses; x++) {
                //Fill in fields for a response
                let responseObj = dataContainer.getResponse(selectedResponses[count - 1]);
                //Fill in number box if it exists
                try {
                    let field = formObject.getTextField("NumberBox" + currentDocSlot);
                    field.setText(count.toString());
                } catch (e) {
                    //Error occurs if PDF does not have a numberBox
                }
                Object.keys(dataContainer.matching).forEach((fieldName) => {
                    try {
                        //Try to fill in the given field
                        let field = formObject.getTextField(fieldName + "" + currentDocSlot);
                        let answerText = responseObj.getAnswer(dataContainer.matching[fieldName]).getFormattedAnswer(fieldName, sheetData);
                        field.setText(answerText);
                    } catch (e) {
                        //No field exists, or a split field did not have a value
                        //console.log(e);
                    }
                });
                //Increment counters
                count++;
                currentDocSlot++;
            }
            //increment page count depending on if first run and unique pages
            if (isFirstRun === true || !hasUniquePages) {//first run, include all pages no matter what
                currentPage++;
            } else {
                //Not the first run and there are unique pages
                currentPage = sheetData['repeatingPages'][currentPage + 1] ? sheetData['repeatingPages'][currentPage + 1] : currentPage + 1;
            }
            currentOverallPage++;
            //If at end of the document, or all responses finished (loop will break after)
            if (currentPage === sheetData.pageSlotCounts.length || count > numberOfSelectedResponses) {
                //Add included data (page numbers, etc)
                //Page numbers
                if (formObject.getFieldMaybe("PageTotal")) {
                    formObject.getTextField("PageTotal").setText(totalPageCount.toString());
                }
                //Total enrolled
                if (formObject.getFieldMaybe("TotalEnrolled")) {
                    formObject.getTextField("TotalEnrolled").setText(numberOfSelectedResponses.toString());
                }
                for (var s = 1; s <= currentPage; s++) {
                    //Current page
                    if (formObject.getFieldMaybe("PageCurrent" + s)) {
                        formObject.getTextField("PageCurrent" + s).setText((currentOverallPage - (currentPage - s)).toString());
                    }
                }

                //Checkbox for multiside
                if (currentPage > 1 && formObject.getFieldMaybe("CheckReverse1")) {
                    for (var s = 1; s <= currentPage; s++) {
                        formObject.getCheckBox("CheckReverse" + s).check();
                    }
                }
                //Fill in course,exam,instructor & examiner info
                var instructorIsExaminer = courseInfo["SameAsInstructor"];
                for (const [fieldName, value] of Object.entries(courseInfo)) {
                    if (fieldName !== "SameAsInstructor" && !(instructorIsExaminer && fieldName.startsWith("Examiner"))) {
                        var trainerFieldName = fieldName.replace("Instructor", "Trainer");
                        if (formObject.getFieldMaybe(fieldName) || formObject.getFieldMaybe(trainerFieldName)) {
                            try {
                                val = value;
                                //Handle Trainers
                                if (formObject.getFieldMaybe(trainerFieldName)) {
                                    console.log(trainerFieldName);
                                    formObject.getTextField(trainerFieldName).setText(val);
                                }
                                //Handle a space in LSS ID
                                if (fieldName.endsWith("Id")) {
                                    val = value.replaceAll(" ", "");
                                }
                                if (fieldName === "ExamDate") {
                                    //Cut off the first part of the exam year: 2025-07-31 -> 25-07-31
                                    val = jsFieldValueModifications['DOB']['ShortYear'](val);
                                }
                                formObject.getTextField(fieldName).setText(val);
                            } catch (e) {
                                console.log("Error occured when filling field " + fieldName);
                            }
                        } else {
                            console.log("Info field missing when adding to PDF", fieldName);
                        }
                    }
                }
                //Handle instructor is examiner checkbox
                if (instructorIsExaminer === true) {
                    if (formObject.getFieldMaybe("ExaminerSameAsInstructor")) {
                        formObject.getCheckBox("ExaminerSameAsInstructor").check();
                    }
                }
                //Examiner same as side 1
                if (formObject.getFieldMaybe("SameExaminer")) {
                    formObject.getCheckBox("SameExaminer").check();
                }
                //Create master PDF and add the page(s).
                var pdfDoc = await PDFLib.PDFDocument.create();
                var pagesToInclude;
                if (isFirstRun || !hasUniquePages) {
                    //include all pages
                    pagesToInclude = Array.from({ length: currentPage }, (e, i) => i);
                } else {
                    //include only repeating pages up to the current page
                    //currentPage is always 1 higher than actual
                    pagesToInclude = sheetData['repeatingPages'].slice(0, sheetData['repeatingPages'].indexOf(currentPage - 1) + 1);
                }
                let copiedPages = await pdfDoc.copyPages(loadedPdfDoc, pagesToInclude);
                copiedPages.forEach((page) => {
                    pdfDoc.addPage(page);
                });
                //Save the current file
                finishedFiles.push(pdfDoc);
                //Load a fresh copy of the file in if needed
                if (count <= numberOfSelectedResponses) {
                    pdfDoc = await PDFLib.PDFDocument.create();
                    loadedPdfBytes = await fetch(filePath + sheetData.documentUrl).then(res => res.arrayBuffer());
                    loadedPdfDoc = await PDFLib.PDFDocument.load(loadedPdfBytes);
                    formObject = loadedPdfDoc.getForm();
                    //Reset counters for next page
                    isFirstRun = false;
                    //If there are specific repeating pages (ex: a unique first page), handle it
                    if (hasUniquePages) {
                        currentPage = sheetData['repeatingPages'][0];//pick the first page that repeats
                        currentDocSlot = (() => {
                            let slotCounts = 1;
                            for (var i = 0; i < currentPage; i++) {
                                slotCounts += sheetData['pageSlotCounts'][i];
                            }
                            return slotCounts;
                        })();
                    } else {
                        //Otherwise, reset the counters
                        currentPage = 0;
                        currentDocSlot = 1;
                    }
                }
            }
        }
        resolve(finishedFiles);
    });
}

const downloadSheetLabel = document.getElementById("downloadSheetName");
const downloadList = document.getElementById("downloadList");

function showDownloadPage(pdfFiles, selectedSheet) {
    courseInfoDialogButton.textContent = "Close";
    courseInfoDialogButton.style.display = "block";
    downloadSheetLabel.textContent = selectedSheet.name;
    //Fill list
    let currentPage = 1;
    pdfFiles.forEach((file) => {
        let pageCount = file.getPageCount();
        let holder = createElement("div", downloadList, "", "downloadListRow");
        let pageText = currentPage + (pageCount > 1 ? " - " + ((pageCount - 1) + currentPage) : "");
        currentPage += pageCount;
        createElement("label", holder, "Page" + (pageCount > 1 ? "s" : "") + " " + pageText, "");
        let buttonHolder = createElement("span", holder, "", "");
        let viewButton = createElement("button", buttonHolder, "visibility", "material-symbols-outlined");
        viewButton.title = "View in new tab";
        handleViewButton(viewButton, file);
        let downloadButton = createElement("button", buttonHolder, "download", "material-symbols-outlined");
        downloadButton.title = "Download to device";
        handleDownloadButton(downloadButton, file, pageText);
    });
    function handleViewButton(button, file) {
        button.onclick = async function () {
            const pdfBytes = await file.save();
            const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');
        };
    }

    function handleDownloadButton(button, file, pageText) {
        button.onclick = async function () {
            const pdfBytes = await file.save();
            const blob = new Blob([pdfBytes]);
            const fileUrl = window.URL.createObjectURL(blob);
            let link = document.createElement("a");
            link.href = fileUrl;
            link.download = selectedSheet.name + " Page " + pageText + ".pdf";
            link.click();
            link.remove();
        };
    }

    courseInfoDialogButton.onclick = function () {
        dialogContainer.style.display = "none";
    };
}

//Field on PDF: Field ID in HTML
const courseInfoFields = {
    Host: ["Name", "AreaPhone", "Phone", "Address", "City", "Province", "PostalCode"],
    Exam: ["Date"],
    Facility: ["Name", "AreaPhone", "Phone"],
    Instructor: ["Name", "Id", "Email", "AreaPhone", "Phone"],
    Examiner: ["Name", "Id", "Email", "AreaPhone", "Phone"]
};
const examinerIsInstructorCheckbox = document.getElementById("infoExaminerIsInstructor");
examinerIsInstructorCheckbox.onchange = handleInstructorExaminerCheckboxClick;
function handleInstructorExaminerCheckboxClick() {
    courseInfoFields["Examiner"].forEach((field) => {
        document.getElementById("infoExaminer" + field).disabled = examinerIsInstructorCheckbox.checked;
    });
}

const courseInfoDialogButton = document.getElementById("courseInfoDialogButton");

function getCourseInformation() {
    hideAllChildren(dialogContainer);
    dialogContainer.style.display = "block";
    courseInfoDialog.style.display = "flex";
    courseInfoDialogPages.style.right = "0%";
    autofillCourseInfoButton.style.display = courseInfoObj ? "block" : "none";
    //Clear previous field values
    examinerIsInstructorCheckbox.checked = false;
    for (const [sectionName, fieldList] of Object.entries(courseInfoFields)) {
        fieldList.forEach((fieldName) => {
            let htmlEl = document.getElementById("info" + sectionName + fieldName);
            if (htmlEl) {
                htmlEl.value = "";
                htmlEl.disabled = false;
            }
        });
    }
    return new Promise((resolve) => {
        courseInfoDialogButton.textContent = "Generate Test Sheet";
        courseInfoDialogButton.style.display = "block";
        courseInfoDialogButton.onclick = function () {
            var infoValues = {};
            for (const [sectionName, fieldList] of Object.entries(courseInfoFields)) {
                fieldList.forEach((fieldName) => {
                    let htmlEl = document.getElementById("info" + sectionName + fieldName);
                    if (htmlEl && htmlEl.value) {
                        infoValues[sectionName + fieldName] = htmlEl.value;
                    } else if (!htmlEl) {
                        console.log("Missing test sheet info field", "info" + sectionName + fieldName);
                    }
                });
            }
            infoValues["SameAsInstructor"] = examinerIsInstructorCheckbox.checked;
            courseInfoDialogButton.style.display = "none";
            resolve(infoValues);
        };
    });
}

window.addEventListener("beforeunload", (ev) => {
    console.log(allowSave(), changePending)
    if (allowSave()) {//Signed in  & already saved, just execute a final save request
        forceSave();
    } else if (changePending) {//Signed out and a change has been made, request leave confirmation
        ev.preventDefault();
    }

});
document.addEventListener("visibilitychange", () => {//Save when the user tabs out
    if (document.visibilityState === "hidden") forceSave();
});
function hideMatchingScreen() {
    dialogContainer.style.display = "none";
    warningBar.removeAttribute("data-module");
}