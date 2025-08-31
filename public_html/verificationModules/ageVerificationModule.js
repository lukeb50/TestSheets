class ageVerificationModule extends baseVerificationModule {

    warningBarExamLabel = document.getElementById("ageWarningExamDateLabel");
    warningbarExamInput = document.getElementById("ageWarningDateInput");

    setWarningBar(sheetInfo) {
        this.warningBarTopLine.textContent = "There are " + this.activeWarnings.length + " candidates who do not meet the age prerequisite today";
        let altSoftText = sheetInfo['prerequisites']['ageRequirementAlternativeText'] ? sheetInfo['prerequisites']['ageRequirementAlternativeText'] : "hold the required certifications";
        this.warningBarBottomLine.textContent = (sheetInfo['prerequisites']['hardAgeRequirement'] && sheetInfo['prerequisites']['hardAgeRequirement'] === true) ?
                "Candidates must meet the age prerequisite by the last/exam date, no exceptions" : "Candidates can be exempted from the age prerequisite if they " + altSoftText;
    }

    getFieldName() {
        return "DOB";
    }

    entryCheckFunction(response, dataContainer, sheetInfo) {
        if (sheetInfo['prerequisites'] && sheetInfo['prerequisites']['age']) {
            var ageRequirement = sheetInfo['prerequisites']['age'];
            if (dataContainer.matching[this.getFieldName()]) {
                var dobString = response.getAnswer(dataContainer.matching[this.getFieldName()]).answerContent;
                let dob = new Date(dobString + "T00:00:00.000Z");
                //Create a Date Object representing the last eligible birthday
                let now = new Date();
                var minAgeDate = new Date(Date.UTC(now.getUTCFullYear() - ageRequirement, now.getUTCMonth(), now.getUTCDate()));
                if (dob <= minAgeDate) {
                    return null;
                } else {
                    return dobString;
                }
            }
        }
        return null;
    }
}
;