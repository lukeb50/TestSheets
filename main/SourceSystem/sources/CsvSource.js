/* global XLSX */

class CsvSource extends Source {

    upload = document.getElementById("csvUpload");

    init() {
        return new Promise((resolve) => {
            this.upload.value = null;
            this.upload.dispatchEvent(new Event('change'));
            resolve();
        });
    }

    getData() {
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
                        var jsonSheet = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                        resolve(jsonSheet);
                    } catch (e) {
                        console.log(e);
                        this.movePageBackwards();
                        alert("Unable to process file");
                    }
                });
                reader.readAsBinaryString(this.upload.files[0]);
            });
        });
    }

    async constructRawResult(jsonSheet) {
        //Handle header row for matching
        var headerRow = jsonSheet[0];
        let columnQuestionIds = new Set();
        for (const headerText of headerRow) {
            //If possible, the column id is to be hash of the text so that updating data is easier
            let columnId = headerText ? await this.hash(headerText) : generateUniqueId((potentialId) => columnQuestionIds.has(potentialId));
            columnQuestionIds.add(columnId);
            this.rawResultObject.addHeader(new RawSourceHeader(columnId, headerText));
        }
        //Convert to array for indexing
        columnQuestionIds = Array.from(columnQuestionIds);
        //Load the rest of the data in, skipping header row
        for (var i = 1; i < jsonSheet.length; i++) {
            let currentRow = jsonSheet[i];
            //Get an ID for this response & build object
            let responseId = generateUniqueId((potentialId) => this.rawResultObject.getResponseIds().includes(potentialId));
            let rawResponse = new RawSourceResponse(responseId);
            currentRow.forEach((cellData, columnI) => {
                //Load in a answer object for each cell across
                rawResponse.addAnswer(new RawSourceResponseAnswer(columnQuestionIds[columnI], cellData));

            });
            //Commit the response
            this.rawResultObject.addResponse(rawResponse);
        }
    }

    async hash(text) {
        const data = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest(
            "SHA-256",
            data
        );
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");
    }
}