class Source {

    authenticationProvider;

    rawResultObject;

    allowEmpty = false;
    isRefreshable = false;

    selectedFile = null;

    getAllowEmpty() {
        return this.allowEmpty;
    }

    getIsRefreshable() {
        return this.isRefreshable;
    }

    setAuthenticationProvider(authProvider) {
        this.authenticationProvider = authProvider;
    }

    //Initializes any required functionality
    init() {
        return Promise.resolve();
    }

    //Loads the data from the service
    getData(file, authenticationCred) {
        return Promise.resolve();
    }

    //Prompts the user to authenticate themselves with the service
    promptAuthenticateUser() {
        return Promise.resolve();
    }

    #promptSelectFileInternal(authenicationData) {
        if (this.selectedFile && this.getIsRefreshable()) {
            return Promise.resolve(this.selectedFile);
        } else {
            return this.promptSelectFile(authenicationData);
        }
    }

    //prompt the user to pick a file
    promptSelectFile(authenicationData) {
        return Promise.resolve();
    }

    //resolves if the passed credential can still be used, rejects if they are no longer valid
    checkSavedCredentials(credentialObject) {
        return Promise.resolve();
    }

    //Takes the raw result from promptUser and builds a RawSourceObject
    async constructRawResult() {
        return;
    }

    //Default execution order
    execute(isUIMode = false) {
        this.rawResultObject = new RawSourceResult();
        return new Promise((resolve, reject) => {
            this.init(isUIMode).then(() => {
                if (this.authenticationProvider.hasCredential(this)) {
                    //A credential is stored, check if it's valid
                    this.checkSavedCredentials((this.authenticationProvider.getCredential(this))).then(() => {
                        //Has a valid credential, prompt user to select
                        this.#getFile(this.authenticationProvider.getCredential(this)).then((rawResult) => {
                            resolve(rawResult);
                        }).catch((e) => {
                            reject(e);
                        })
                    }).catch(() => {
                        //No valid credential stored
                        this.#getWithAuthPrompt().then((rawResult) => {
                            resolve(rawResult)
                        }).catch((e) => {
                            reject(e);
                        })
                    })
                } else {
                    //No credential stored, prompt
                    this.#getWithAuthPrompt().then((rawResult) => {
                        resolve(rawResult)
                    }).catch((e) => {
                        reject(e);
                    })
                }
            }).catch((e) => {
                reject(e);
            })
        });

    }

    #getWithAuthPrompt() {
        return new Promise((resolve, reject) => {
            this.promptAuthenticateUser().then((authResult) => {
                //User now has a valid credential
                if (authResult) {
                    //If this is a credentialed service, save for later
                    this.authenticationProvider.addCredential(this, authResult);
                }
                //prompt user to select
                this.#getFile(this.authenticationProvider.getCredential(this)).then((rawResult) => {
                    resolve(rawResult);
                }).catch((e) => {
                    reject(e);
                })
            }).catch((e) => {
                //User did not authenticate, fail at this point
                this.authenticationProvider.clearCredential(this);
                reject(e);
            })
        });
    }

    #getFile(authCredential) {
        return new Promise((resolve, reject) => {
            this.#promptSelectFileInternal(authCredential).then((selectedFile) => {
                this.selectedFile = selectedFile;
                this.getData(selectedFile, authCredential).then(async (data) => {
                    await this.constructRawResult(data);
                    this.rawResultObject.normalizeData();
                    resolve(this.rawResultObject);
                }).catch((e) => {
                    reject(e);
                })
            }).catch((e) => {
                reject(e);
            })
        })
    }

    movePageForwards() {
        document.getElementById("sourceDialogSwipeDiv").style.right = "200%";
    }

    movePageBackwards() {
        document.getElementById("sourceDialogSwipeDiv").style.right = "100%";
    }
}