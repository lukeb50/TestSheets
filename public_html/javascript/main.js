/* global fetch, Promise, PDFLib, URL */

//Main screen lists
const lifesavingList = document.getElementById("mainLifesavingList");
const firstAidList = document.getElementById("mainFirstAidList");
const leadershipList = document.getElementById("mainLeadershipList");
const otherList = document.getElementById("mainOtherList");
const lists = {lifesaving: lifesavingList, firstAid: firstAidList, leadership: leadershipList, other: otherList};
const dialogContainer = document.getElementById("dialogContainer");
//Source Dialog
const sourceDialog = document.getElementById("sourceDialog");
const sourceDialogPages = document.getElementById("sourceDialogSwipeDiv");
//CourseInfoDialog
const courseInfoDialog = document.getElementById("courseInfoDialog");
const courseInfoDialogPages = document.getElementById("courseInfoDialogSwipeDiv");
//Main Screens
const listScreen = document.getElementById("mainListContainer");
const tableScreen = document.getElementById("MainSelectionContainer");
var fieldData;
var sheetData;

var courseInfoObj = null;

const jsFieldValueModifications = {
    PostalCode: {
        Formatted: function (value) {
            var matchInfo = value.toUpperCase().match(/(\w{3})[ -]?(\w{3})/);
            return matchInfo[1] + " " + matchInfo[2];
        }
    }
}

window.onload = function () {
    //Load JSON files
    loadJsonFiles().then((data) => {
        fieldData = data['fields'];
        sheetData = data['sheets'];
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
                    alert("The selected form has no responses");
                    return;
                }
                dataContainer.matchQuestionFields();
                showMatchingScreen(dataContainer, selectedSheet).catch((e) => {
                    console.log("Error on matching screen:", e);
                    listScreen.style.display = "flex";
                    tableScreen.style.display = "none";
                    dialogContainer.style.display = "none";
                });
                //dataContainer.splitDividedFields(selectedSheet, fieldData);
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
const sourceOptions = [{sourceName: "GoogleForms", button: googleFormsSourceBtn, inputPage: googleFormsInputPage},
    {sourceName: "csv", button: csvSourceBtn, inputPage: csvInputPage},
    {sourceName: "test", button: testSourceBtn, inputPage: testInputPage}
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

function generatePdfFile(sheetData, dataContainer, selectedResponses, courseInfo) {
    return new Promise(async (resolve, reject) => {
        var finishedFiles = [];
        //Load the PDF file
        try {
            var response = await fetch("pdfFiles/" + sheetData.documentUrl);
        } catch (e) {
            reject(e);
            return;
        }
        var loadedPdfBytes = await response.arrayBuffer();
        var loadedPdfDoc = await PDFLib.PDFDocument.load(loadedPdfBytes);
        let numberOfSelectedResponses = selectedResponses.length;
        let totalPageCount = (() => {
            let count = 0;
            let pageCount = 0;
            while (count < numberOfSelectedResponses) {
                count += sheetData.pageSlotCounts[pageCount % sheetData.pageSlotCounts.length];
                pageCount++;
            }
            return pageCount;
        })();
        var count = 1;
        var currentPage = 0;
        var currentOverallPage = 0;
        var currentDocSlot = 1;
        var formObject = loadedPdfDoc.getForm();
        while (count <= numberOfSelectedResponses) {
//Handle a single page
            for (x = 0; x < sheetData.pageSlotCounts[currentPage] && count <= numberOfSelectedResponses; x++) {
//Fill in fields
                let responseObj = dataContainer.getResponse(selectedResponses[count - 1]);
                Object.keys(dataContainer.matching).forEach((fieldName) => {
                    try {
//Try to fill in the given field
                        let answerText = responseObj.getAnswer(dataContainer.matching[fieldName]).answerContent;
                        let field = formObject.getTextField(fieldName + "" + currentDocSlot);
                        if (sheetData['ModificationsToApply'] && sheetData['ModificationsToApply'][fieldName]) {
                            let modificationName = sheetData['ModificationsToApply'][fieldName];
                            if (fieldData[fieldName]['FieldValueModifications'] && fieldData[fieldName]['FieldValueModifications'][modificationName]) {
                                if (fieldData[fieldName]['FieldValueModifications'][modificationName].length === 2) {
                                    //Encoded JSON modification
                                    let modificationDetails = fieldData[fieldName]['FieldValueModifications'][modificationName];
                                    answerText = answerText.replaceAll(new RegExp(modificationDetails[0], "g"), modificationDetails[1]);
                                } else {
                                    //Reference JSON modification
                                    console.log("Handling modification for " + answerText);
                                    console.log(jsFieldValueModifications[fieldName][modificationName](answerText));
                                    answerText = jsFieldValueModifications[fieldName][modificationName](answerText);
                                }
                            }
                        }
                        field.setText(answerText);
                    } catch (e) {
                        //No field exists, or a split field did not have a value
                        console.log(e);
                    }
                });
                //Increment counters
                count++;
                currentDocSlot++;
            }
//increment page count
            currentPage++;
            currentOverallPage++;
            //If at end of the document, or all responses finished (loop will break after)
            if (currentPage === sheetData.pageSlotCounts.length || count > numberOfSelectedResponses) {
//Add included data (page numbers, etc)
//Page numbers
                if (formObject.getFieldMaybe("PageTotal")) {
                    formObject.getTextField("PageTotal").setText(totalPageCount.toString());
                    for (var s = 1; s <= currentPage; s++) {
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
                        if (formObject.getFieldMaybe(fieldName)) {
                            try {
                                val = value;
                                //Handle a space in LSS ID
                                if (fieldName.endsWith("Id")) {
                                    val = value.replaceAll(" ", "");
                                }
                                formObject.getTextField(fieldName).setText(val);
                            } catch (e) {
                                console.log("Error occured when filling field " + fieldName, e);
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
                let pagesToInclude = Array.from({length: currentPage}, (e, i) => i);
                let copiedPages = await pdfDoc.copyPages(loadedPdfDoc, pagesToInclude);
                copiedPages.forEach((page) => {
                    pdfDoc.addPage(page);
                });
                //Save the current file
                finishedFiles.push(pdfDoc);
                //Load a fresh copy of the file in if needed
                if (count <= numberOfSelectedResponses) {
                    pdfDoc = await PDFLib.PDFDocument.create();
                    loadedPdfBytes = await fetch("pdfFiles/" + sheetData.documentUrl).then(res => res.arrayBuffer());
                    loadedPdfDoc = await PDFLib.PDFDocument.load(loadedPdfBytes);
                    formObject = loadedPdfDoc.getForm();
                    //Reset counters for next page
                    currentPage = 0;
                    currentDocSlot = 1;
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
            const pdfBlob = new Blob([pdfBytes], {type: 'application/pdf'});
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

const autofillCourseInfoButton = document.getElementById("autofillCourseInfoButton");
autofillCourseInfoButton.onclick = function () {
    console.log(courseInfoObj);
    if (courseInfoObj) {
        examinerIsInstructorCheckbox.checked = courseInfoObj["SameAsInstructor"];
        handleInstructorExaminerCheckboxClick();
        for (const [fieldName, value] of Object.entries(courseInfoObj)) {
            if (fieldName !== "SameAsInstructor") {
                document.getElementById("info" + fieldName).value = value;
            }
        }
    }
};

const matchingTable = document.getElementById("mainSelectionTable");
const matchingConfirmBtn = document.getElementById("confirmSelectionTableBtn");
const matchingSelectedCountLabel = document.getElementById("mainSelectionCountLabel");
function showMatchingScreen(dataContainer, selectedSheet) {
    listScreen.style.display = "none";
    tableScreen.style.display = "flex";
    clearChildren(matchingTable);
    var selectedResponses = [];
    //Create header row
    let headerRow = createElement("tr", matchingTable, "", "");
    let allSelectBox = createElement("th", headerRow, "", "");
    //Master "check all"
    let allSelectCheckbox = createElement("input", allSelectBox, "", "");
    allSelectCheckbox.id = "matchingSelectAll";
    allSelectCheckbox.checked = true;
    allSelectCheckbox.type = "checkbox";
    allSelectCheckbox.onchange = handleSelectAllCheckboxChanged;
    let allLbl = createElement("label", allSelectBox, "Select All", "");
    allLbl.setAttribute("for", "matchingSelectAll");
    //Create question dropdowns
    dataContainer.includedQuestions.forEach((questionId) => {
        let questionSelector = createElement("select", createElement("th", headerRow, "", ""), "", "");
        fillSelector(questionSelector, questionId);
        questionSelector.setAttribute("data-question", questionId);
        questionSelector.className = "matchingSelect";
        questionSelector.onchange = handleSelectChanged;
        let matchResult = Object.entries(dataContainer.matching).find(match => match[1] === questionId);
        if (matchResult) {
            questionSelector.value = matchResult[0];
        } else {
            questionSelector.value = "";
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
        let newQuestionId = dataContainer.addEmptyAnswer();
        //Create the select
        let newSelectHeader = createElement("th", headerRow, "", "");
        //Insert properly
        headerRow.insertBefore(newSelectHeader, newColumnButtonHolder);
        let questionSelector = createElement("select", newSelectHeader, "", "");
        //Fill the select & bind
        fillSelector(questionSelector, newQuestionId);
        questionSelector.setAttribute("data-question", newQuestionId);
        questionSelector.className = "matchingSelect";
        questionSelector.onchange = handleSelectChanged;
        //Call function so that options are properly disabled
        handleSelectChanged();
        //Create the new input boxes
        for (const [responseId, response] of Object.entries(dataContainer.getResponses())) {
            let responseRow = document.getElementById("matchingTableRow" + responseId);
            let newInputHolder = createElement("td", responseRow, "", "");
            responseRow.insertBefore(newInputHolder, document.getElementById("matchingTableEmpty" + responseId));
            let answerInput = createElement("input", newInputHolder, "", "");
            answerInput.setAttribute("data-response", responseId);
            answerInput.setAttribute("data-question", newQuestionId);
            answerInput.onchange = handleInputUpdate;
            answerInput.value = response.getAnswer(newQuestionId).answerContent;
        }
    };
    //Create main table
    var currentCount = 1;
    for (const [responseId, response] of Object.entries(dataContainer.getResponses())) {
        createRow(responseId, response, currentCount);
        currentCount++;
    }
    //Update label
    updateCountLabel();
    //Create new response button
    let manualButton = createElement("Button", matchingTable, "Manually Add Response", "");
    manualButton.id = "mainSelectionTableManualResponseBtn";
    manualButton.onclick = function () {
        let responseId = dataContainer.addEmptyResponse();
        let response = dataContainer.getResponse(responseId);
        let createdRow = createRow(responseId, response, currentCount);
        matchingTable.insertBefore(createdRow, manualButton);
        currentCount++;
        updateCountLabel();
    };
    return new Promise((resolve, reject) => {
        document.getElementById("cancelSelectionTableBtn").onclick = function () {
            reject("User cancelled operation");
        };

        matchingConfirmBtn.onclick = function () {
            let containerResponseKeys = Object.keys(dataContainer.getResponses());
            selectedResponses.sort((a, b) => {
                return containerResponseKeys.indexOf(a) - containerResponseKeys.indexOf(b);
            });
            dataContainer.splitDividedFields();
            getCourseInformation().then((courseInfo) => {
                courseInfoObj = courseInfo;
                clearChildren(downloadList);
                courseInfoDialogPages.style.right = "100%";
                generatePdfFile(selectedSheet, dataContainer, selectedResponses, courseInfo).then((files) => {
                    courseInfoDialogPages.style.right = "200%";
                    showDownloadPage(files, selectedSheet);
                }).catch((e) => {
                    dialogContainer.style.display = "none";
                    alert("Error generating Pdf files, please try again later");
                });
            });
        };
    });
    function createRow(responseId, response, currentCount) {
        selectedResponses.push(responseId);
        let row = createElement("tr", matchingTable, "", "");
        row.id = "matchingTableRow" + responseId;
        row.setAttribute("data-response", responseId);
        let controlBox = createElement("td", row, "", "");
        //Create checkbox
        let controlBoxCheckbox = createElement("input", controlBox, "", "");
        controlBoxCheckbox.setAttribute("data-response", responseId);
        controlBoxCheckbox.type = "checkbox";
        controlBoxCheckbox.checked = true;
        controlBoxCheckbox.setAttribute("data-response", responseId);
        controlBoxCheckbox.id = "matchingSelect-" + responseId;
        controlBoxCheckbox.onchange = handleCheckboxChanged;
        //Create label
        let lbl = createElement("label", controlBox, "Response " + currentCount, "");
        lbl.setAttribute('for', "matchingSelect-" + responseId);
        //Create question boxes
        dataContainer.includedQuestions.forEach((questionId) => {
            let answerObj = response.getAnswer(questionId);
            let answerInput = createElement("input", createElement("td", row, "", ""), "", "");
            answerInput.setAttribute("data-response", responseId);
            answerInput.setAttribute("data-question", questionId);
            answerInput.onchange = handleInputUpdate;
            answerInput.value = answerObj.answerContent;
        });
        //Create blank box for new column button col
        createElement("td", row, "", "").id = "matchingTableEmpty" + responseId;
        return row;
    }

    function handleSelectChanged(e) {
        let selectors = Array.from(document.getElementsByClassName("matchingSelect"));
        //Updating matching table
        if (e) {
            let newMatching = {};
            selectors.forEach((el) => {
                if (el.value !== "") {
                    newMatching[el.value] = el.getAttribute("data-question");
                }
            });
            dataContainer.matching = newMatching;
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
    }

    //Handle when user updates a value
    function handleInputUpdate(e) {
        let target = e.target;
        let responseId = target.getAttribute("data-response");
        let questionId = target.getAttribute("data-question");
        dataContainer.getResponse(responseId).getAnswer(questionId).answerContent = target.value;
    }

    //Handle when the user clicks the "Select All" checkbox
    function handleSelectAllCheckboxChanged(e) {
        let newState = e.target.checked;
        selectedResponses = [];
        Object.keys(dataContainer.getResponses()).forEach((responseId) => {
            let check = document.getElementById("matchingSelect-" + responseId);
            check.checked = newState;
            if (newState === true) {
                selectedResponses.push(responseId);
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
            selectedResponses.push(responseId);
        } else {
            if (selectedResponses.includes(responseId)) {
                selectedResponses.splice(selectedResponses.indexOf(responseId), 1);
            }
        }
        //Update the label
        updateCountLabel();
        //Update the select all checkbox
        if (selectedResponses.length === dataContainer.getNumberOfResponses()) {
            allSelectCheckbox.checked = true;
        } else {
            allSelectCheckbox.checked = false;
        }
    }

    //Updates the label next to state buttons
    function updateCountLabel() {
        let count = selectedResponses.length;
        matchingSelectedCountLabel.textContent = (count > 0 ? count : "No") + " Responses Included";
        matchingConfirmBtn.disabled = count === 0;
    }

    //Helper function to fill question field selectors
    function fillSelector(selector, questionId) {
        let fields = selectedSheet.fields;
        if (selectedSheet["DividablesToInclude"]) {
            fields = fields.concat(selectedSheet.DividablesToInclude);
        }
        createElement("option", selector, "", "").value = "";
        fields.forEach((fieldName) => {
            let opt = createElement("option", selector, fieldData[fieldName]['Display']['English'], "");
            opt.value = fieldName;
        });
    }
}

async function loadJsonFiles() {
    return Promise.all([fetch('data/fieldDataFile.json'), fetch('data/sheetDataFile.json')]).then((values) => {
        return Promise.all(values.map((response) => response.json())).then((jsonValues) => {
            return {fields: jsonValues[0], sheets: jsonValues[1]};
        });
    });
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
    appendTo.appendChild(el);
    if (textContent) {
        el.textContent = textContent;
    }
    if (classNames) {
        el.className = classNames;
    }
    return el;
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
};