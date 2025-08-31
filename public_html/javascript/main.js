/* global fetch, Promise, PDFLib, URL, autofills */

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
//Authentication
const authProvider = new AuthProvider();
//Data
var fieldData;
var sheetData;

var courseInfoObj = null;

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
    }
};

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
                showMatchingScreen(dataContainer, selectedSheet, null).catch((e) => {
                    console.log("Error on matching screen:", e);
                    hideMatchingScreen();
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
                        if (formObject.getFieldMaybe(fieldName)) {
                            try {
                                val = value;
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
                    pagesToInclude = Array.from({length: currentPage}, (e, i) => i);
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
                    loadedPdfBytes = await fetch("pdfFiles/" + sheetData.documentUrl).then(res => res.arrayBuffer());
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
const matchingSheetInfoLabel = document.getElementById("mainSelectionSheetLabel");

const warningBar = document.getElementById("mainSelectionWarningBar");
const warningPreviousBtn = document.getElementById("warningPreviousBtn");
const warningPageLabel = document.getElementById("warningPageLabel");
const warningNextBtn = document.getElementById("warningNextBtn");

function showMatchingScreen(dataContainer, selectedSheet, existingSelectedResponses) {
    console.log(dataContainer);
    var verificationModules = [new ageVerificationModule()];
    //Run an inital verification
    verificationModules.forEach((module) => {
        module.runVerification(dataContainer, selectedSheet);
    });
    matchingSheetInfoLabel.textContent = selectedSheet.name + " - " + selectedSheet.descriptionText;
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
    //Set proper state if re-rendering
    allSelectCheckbox.checked = existingSelectedResponses ? existingSelectedResponses.length === dataContainer.getNumberOfResponses() : true;
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
        let matchResult = dataContainer.getFieldNameFromQuestionId(questionId);
        if (matchResult) {
            questionSelector.value = matchResult;
            questionSelector.setAttribute("data-val", matchResult);
        } else {
            questionSelector.value = "";
            questionSelector.setAttribute("data-val", "");
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
        questionSelector.setAttribute("data-val", "");
        handleSelectChanged();
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
        if (!existingSelectedResponses || (existingSelectedResponses && existingSelectedResponses.includes(responseId))) {
            selectedResponses.push(responseId);
        }
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
    //Create new response button
    let manualButton = createElement("Button", matchingTable, "Manually Add Response", "");
    manualButton.id = "mainSelectionTableManualResponseBtn";
    manualButton.onclick = function () {
        let responseId = dataContainer.addEmptyResponse();
        let response = dataContainer.getResponse(responseId);
        selectedResponses.push(responseId);
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
            dataContainer.mergeCombinedFields();
            getCourseInformation().then((courseInfo) => {
                courseInfoObj = courseInfo;
                clearChildren(downloadList);
                courseInfoDialogPages.style.right = "100%";
                generatePdfFile(selectedSheet, dataContainer, selectedResponses, courseInfo).then((files) => {
                    courseInfoDialogPages.style.right = "200%";
                    showDownloadPage(files, selectedSheet);
                    //resolve();
                    //showMatchingScreen(dataContainer, selectedSheet, selectedResponses).catch((err) => {
                    //hideMatchingScreen();
                    //});
                }).catch((e) => {
                    dialogContainer.style.display = "none";
                    alert("Error generating Pdf files, please try again later");
                });
            });
        };
    });
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
        controlBoxCheckbox.checked = selectedResponses.includes(responseId);
        controlBoxCheckbox.setAttribute("data-response", responseId);
        controlBoxCheckbox.id = "matchingSelect-" + responseId;
        controlBoxCheckbox.onchange = handleCheckboxChanged;
        //Create label
        let lbl = createElement("label", controlBox, "Response " + currentCount, "");
        lbl.setAttribute('for', "matchingSelect-" + responseId);
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
                    }
                    //If the select has a value, set it in the matching object
                    if (el.value) {
                        dataContainer.matching[el.value] = el.getAttribute("data-question");
                    }
                    //Set the "new" current value for future runs
                    el.setAttribute("data-val",el.value);
                }
            });
            console.log(dataContainer.matching);
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
        dataContainer.getResponse(responseId).getAnswer(questionId).answerContent = target.value;
        handleAutofillButtons();
        //Re-run each verification module if affected
        //Determine the name of the field being modified
        var selectedFieldMatching = dataContainer.getFieldNameFromQuestionId(questionId);
        if (selectedFieldMatching) {
            showWarningBar(selectedFieldMatching);
        }
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
        fields = dataContainer.getFullFieldsList();
        createElement("option", selector, "", "").value = "";
        fields.forEach((fieldName) => {
            let opt = createElement("option", selector, fieldData[fieldName]['Display']['English'], "");
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
                                dataContainer.getResponse(responseId).getAnswer(questionId).answerContent = autofilledValue;
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
        verificationModules.forEach((module) => {
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
        let numberOfWarnings = verificationModules.reduce((acc, module) => acc + module.activeWarnings.length === 0 ? 0 : 1, 0);
        if (numberOfWarnings > 0) {
            if (!warningBar.hasAttribute("data-module")) {
                let firstModule = verificationModules.find((module) => module.activeWarnings.length > 0);
                warningBar.setAttribute("data-module", firstModule.constructor.name);
            }
            warningBar.style.display = "flex";
            //Pick the appropriate module and display it
            let module = verificationModules.find((module) => module.constructor.name === warningBar.getAttribute("data-module"));
            module.setWarningBar(selectedSheet);
            let currentIndex = verificationModules.indexOf(module);
            warningPageLabel.textContent = (currentIndex + 1) + " / " + numberOfWarnings;
            warningPreviousBtn.disabled = numberOfWarnings === 1;
            warningNextBtn.disabled = numberOfWarnings === 1;
        } else {
            warningBar.style.display = "none";
        }
    }
}

function hideMatchingScreen() {
    listScreen.style.display = "flex";
    tableScreen.style.display = "none";
    dialogContainer.style.display = "none";
    warningBar.removeAttribute("data-module");
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