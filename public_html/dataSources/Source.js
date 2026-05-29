class Source {

    sheetInformation;
    fieldData;
    authenticationProvider;

    allowEmpty = false;

    getAllowEmpty() {
        return this.allowEmpty;
    }

    //Initializes any required functionality
    init() {
        return new Promise((resolve) => {
            resolve();
        });
    }

    setAuthenticationProvider(authProvider) {
        this.authenticationProvider = authProvider;
    }

    //Prompts the user to provide raw data in the appropriate format
    promptUser() {
        return new Promise((resolve, reject) => {
            resolve();
        });
    }

    movePageForwards() {
        document.getElementById("sourceDialogSwipeDiv").style.right = "200%";
    }

    movePageBackwards() {
        document.getElementById("sourceDialogSwipeDiv").style.right = "100%";
    }

    //Sets the current sheetInformation & fieldData, to be passed on to the container
    setInformation(sheetInformation, fieldData) {
        this.sheetInformation = sheetInformation;
        this.fieldData = fieldData;
    }

    //Returns a ResponseContainer
    getResponseContainer() {
        return new ResponseContainerBuilder().setSheetInformation(this.sheetInformation).setFieldData(this.fieldData).buildNewEmpty();
    }

    stripFieldName(name) {
        return name.trim().toLowerCase().replaceAll(" ", "");
    }

    //Default execution order
    execute() {
        return new Promise((resolve, reject) => {
            this.init().then(() => {
                this.promptUser().then(() => {
                    resolve(this.getResponseContainer());
                }).catch((e) => {
                    reject(e);
                });
            }).catch((e) => {
                reject(e);
            });
        });
    }
}