class Source {

    sheetInformation;
    fieldData;

    //Initializes any required functionality
    init() {
        return new Promise((resolve) => {
            resolve();
        });
    }

    //Prompts the user to provide raw data in the appropriate format
    promptUser() {

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
        return new ResponseContainer(this.sheetInformation, this.fieldData);
    }
    
    stripFieldName(name){
        return name.toLowerCase().replaceAll(" ","");
    }

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