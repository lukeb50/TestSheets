/* global fetch, gapi, google, Promise */

class GoogleFormsSource extends Source {

    isRefreshable = true;

    tokenClient;

    init(isUIMode = false) {
        return new Promise((resolve, reject) => {
            gapi.load('picker', () => {
                const clientId = "812050814842-cajsiupsnsntoubcb7psv52cv4bhrr58.apps.googleusercontent.com";
                const scopes = "https://www.googleapis.com/auth/drive.file";
                this.tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: scopes
                });
                if (isUIMode) {
                    document.getElementById("googleAuthButton").onclick = (() => {
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        });
    }

    promptAuthenticateUser() {
        return new Promise((resolve, reject) => {
            var accessToken;
            // Create and render a Google Picker object for selecting from Drive.
            this.tokenClient.callback = async (response) => {
                if (response.error !== undefined) {
                    reject("Failed to authenticate");
                }
                accessToken = response.access_token;
                resolve(accessToken);
            };
            this.tokenClient.error_callback = async (response) => {
                reject("Failed to authenticate")
            }
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }

    checkSavedCredentials(accessToken) {
        return new Promise(async (resolve, reject) => {
            let checkQuery = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + accessToken
                }
            });
            if (checkQuery.status === 200) {
                resolve();
            } else {
                reject();
            }
        })
    }

    getData(formId, accessToken) {
        return new Promise((resolve, reject) => {
            let responsesQuery = fetch("https://forms.googleapis.com/v1/forms/" + formId + "/responses", {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + accessToken
                }
            });

            let formQuery = fetch("https://forms.googleapis.com/v1/forms/" + formId, {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + accessToken
                }
            });
            this.movePageForwards();
            let apiResults = Promise.all([formQuery, responsesQuery]).then((values) => {
                return Promise.all(values.map((response) => response.json()));
            });
            apiResults.then((res) => {
                resolve({ form: res[0], responses: res[1] });
            }).catch((e) => {
                this.movePageBackwards();
                console.log(e);
                this.authenticationProvider.clearCredential(this);
                alert("An error occured, please try again");
            });
        });
    }

    promptSelectFile(accessToken) {
        return new Promise((resolve, reject) => {
            const showPicker = () => {
                let viewConfig = new google.picker.DocsView(google.picker.ViewId.FORMS);
                const picker = new google.picker.PickerBuilder()
                    .addView(viewConfig)
                    .disableFeature(google.picker.Feature.MULTISELECT_ENABLED)
                    .enableFeature(google.picker.Feature.NAV_HIDDEN)
                    .enableFeature(google.picker.Feature.MINE_ONLY)
                    .setOAuthToken(accessToken)
                    .setDeveloperKey('AIzaSyDZEUHLaA-ttIr1wtX5Wq7qGK-8bn7m5Oc')
                    .setAppId("812050814842")
                    .setCallback(async (result) => {
                        if (result.action === "picked") {
                            let resultingFiles = result['docs'];
                            if (resultingFiles && resultingFiles.length === 1 && resultingFiles[0].serviceId === "form") {
                                //Load form with Google Form API
                                let formId = resultingFiles[0].id;
                                resolve(formId);

                            } else {
                                reject("Error from Google");
                            }
                        }
                    })
                    .build();
                picker.setVisible(true);
            };
            showPicker();
        })
    }

    constructRawResult(combinedData) {
        return GoogleFormsSource.buildGoogleFormsRaw(combinedData, this.rawResultObject);
    }

    static buildGoogleFormsRaw({ form, responses } = {}, object) {
        //Process headers
        if (!form['items'] || !Array.isArray(form['items'])) {
            throw new Error("Invalid data");
        }
        form['items'].forEach((formItem) => {
            //Loop each entry in the form
            if (!formItem['questionItem'] || !formItem['questionItem']['question']) {
                return;//Stop this execution, the entry is not a question.
            }
            let headerText = formItem['title'];
            let questionId = formItem['questionItem']['question']['questionId'];
            object.addHeader(new RawSourceHeader(questionId, headerText));
        });
        //Process responess
        if (responses['nextPageToken']) {
            throw new Error("Too many responses");
        }
        responses['responses'].forEach((response) => {
            var responseRaw = new RawSourceResponse(response['responseId'], new Date(response['lastSubmittedTime']).getTime());
            let answerListing = response['answers'];
            for (const [key, answer] of Object.entries(answerListing)) {
                let questionId = answer['questionId'];
                let questionContent = answer['textAnswers']['answers'][0]['value'];
                responseRaw.addAnswer(new RawSourceResponseAnswer(questionId, questionContent));
            }
            object.addResponse(responseRaw);
        });
        return;
    }
}