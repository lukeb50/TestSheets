class TestSheetPdfGenerator {
    filePath = "../pdfFiles/";
    generatePdfFile(sheetData, sheetSkeleton, selectedResponses, courseInfo) {
        return new Promise(async (resolve, reject) => {
            var finishedFiles = [];
            //Load the PDF file
            try {
                var response = await fetch(this.filePath + sheetData.documentUrl);
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
                for (let x = 0; x < sheetData.pageSlotCounts[currentPage] && count <= numberOfSelectedResponses; x++) {
                    //Fill in fields for a response
                    let responseObj = sheetSkeleton.getResponses().find((response) => response.responseId === selectedResponses[count - 1]);
                    //Fill in number box if it exists
                    try {
                        let field = formObject.getTextField("NumberBox" + currentDocSlot);
                        field.setText(count.toString());
                    } catch (e) {
                        //Error occurs if PDF does not have a numberBox
                    }
                    Object.keys(sheetSkeleton.matching).forEach((fieldName) => {
                        try {
                            //Try to fill in the given field
                            let field = formObject.getTextField(fieldName + "" + currentDocSlot);
                            let answerText = responseObj.getAnswer(sheetSkeleton.matching[fieldName]).getContent();
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
                        loadedPdfBytes = await fetch(this.filePath + sheetData.documentUrl).then(res => res.arrayBuffer());
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
}