class baseVerificationModule {

    dismissHistory = {};
    activeWarnings = [];
    
    warningBarTopLine = document.getElementById("warningBarTopLine");
    warningBarBottomLine = document.getElementById("warningBarBottomLine");

    //Must return null if value meets the criteria, or the value if in violation
    entryCheckFunction(response, dataContainer, sheetInfo) {
        return null;
    }

    //Must be overridden to the field primarily associated with the verification
    getFieldName() {
        return "";
    }
    
    //Must be overridden to set the contents of the warning bar
    setWarningBar(sheetInfo){
        
    }

    runVerification(dataContainer, sheetInfo) {
        var violatingResponses = [];
        var hasChanged = false;
        for (const [responseId, response] of Object.entries(dataContainer.getResponses())) {
            var resultingValue = this.entryCheckFunction(response, dataContainer, sheetInfo);
            if (resultingValue) {//Function has determined a violation
                //Check if violation has already been dismissed
                if (!this.dismissHistory[responseId] || (this.dismissHistory[responseId] && this.dismissHistory[responseId] !== resultingValue)) {
                    delete this.dismissHistory[response];//Remove a previously dimissal history
                    violatingResponses.push(responseId);
                    //We are adding this response, a change has happened
                    if(this.activeWarnings.indexOf(responseId)===-1){
                        hasChanged = true;
                    }
                }
            }
        }
        let oldNumberOfWarnings = this.activeWarnings.length;
        this.activeWarnings = violatingResponses;
        //We added an entry or the length changed
        //Typical calling pattern will exect a single change per invocation
        return hasChanged === true || oldNumberOfWarnings.length !==this.activeWarnings.length;
    }

    dismissWarning(responseId, dataContainer) {
        fieldId = dataContainer.matching[this.getFieldName()];
        this.dismissHistory[responseId] = dataContainer.getResponse(responseId).getAnswer(fieldId).answerContent;
    }

    clearDismissals() {
        this.dismissHistory = {};
    }
    
    clearWarnings(){
        this.activeWarnings = [];
    }
}