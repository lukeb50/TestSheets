/* global XLSX */

class CsvSource extends Source {

    upload = document.getElementById("csvUpload");
    responses = [];
    internalMatching = {};
    internalColumnNumberMatching = {};
    columnIdMapping = [];

    init() {
        return new Promise((resolve) => {
            this.upload.value = null;
            this.upload.dispatchEvent(new Event('change'));
            resolve();
        });
    }

    promptUser() {
        return new Promise((resolve, reject) => {
            document.getElementById("csvConfirmButton").onclick = (() => {
                this.movePageForwards();
                var reader = new FileReader();
                reader.onload = ((e) => {
                    try {
                        var data = e.target.result;
                        var workbook = XLSX.read(data, {
                            type: 'string',
                            raw: true
                        });
                        var firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                        var jsonSheet = XLSX.utils.sheet_to_json(firstSheet, {header: 1});
                        //Handle header row for matching
                        var headerRow = jsonSheet[0];
                        //run matching against the header row
                        this.internalColumnNumberMatching = this.matchHeaders(headerRow);
                        //Load the rest of the data in, skipping header row
                        for (var i = 1; i < jsonSheet.length; i++) {
                            let currentRow = jsonSheet[i];
                            var responseObj = new Response(Date.now());
                            currentRow.forEach((cellData, columnI) => {
                                //Get an Id for the column if not already (first row)
                                if (!this.columnIdMapping[columnI]) {
                                    this.columnIdMapping[columnI] = new ResponseContainer().generateUniqueId((potentialId) => Object.values(this.columnIdMapping).includes(potentialId));
                                }
                                //Add an answer to the response
                                if (cellData) {
                                    let questionId = this.columnIdMapping[columnI];
                                    responseObj.addAnswer(new Answer(cellData, questionId));
                                }
                            });
                            this.responses.push(responseObj);
                        }
                        resolve();
                    } catch (e) {
                        this.movePageBackwards();
                        alert("Unable to process file");
                    }
                });
                reader.readAsBinaryString(this.upload.files[0]);
            });
        });
    }

    matchHeaders(headerRow) {
        var matchingTable = {};//fieldName -> rowId (to be matched to QuestionId)
        headerRow.forEach((header, i) => {
            //Each field in the sheet
            this.sheetInformation.fields.forEach((fieldName) => {
                if (this.stripFieldName(header).includes(this.stripFieldName(fieldName))) {
                    matchingTable[fieldName] = i;
                }
            });
        });
        return matchingTable;
    }

    getResponseContainer() {
        var container = super.getResponseContainer();
        container.setMatching(this.internalMatching);
        this.responses.forEach((response) => {
            container.addResponse(response);
        });
        return container;
    }
}
;