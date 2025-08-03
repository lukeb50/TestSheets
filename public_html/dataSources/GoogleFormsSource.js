/* global fetch, gapi, google, Promise */

class GoogleFormsSource extends Source {

    JsonResults = null;
    tokenClient;
    internalMatching = {};

    init() {
        return new Promise((resolve, reject) => {
            gapi.load('picker', () => {
                const clientId = "0812050814842-cajsiupsnsntoubcb7psv52cv4bhrr58.apps.googleusercontent.com";
                const scopes = "https://www.googleapis.com/auth/drive.file";
                this.tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: scopes
                });
                resolve();
            });
        });
    }

    promptUser() {
        return new Promise((resolve, reject) => {
            document.getElementById("googleAuthButton").onclick = (() => {
                var accessToken;
                // Create and render a Google Picker object for selecting from Drive.
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
                                        let responsesQuery = fetch("https://forms.googleapis.com/v1/forms/" + formId + "/responses", {
                                            method: "GET",
                                            headers: {
                                                "Authorization": "Bearer " + accessToken
                                            }
                                        }).catch((exception) => {
                                            console.log(exception);
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
                                            this.JsonResults = res[1];
                                            //Pass form info into matching function
                                            this.internalMatching = this.performGoogleFormsMatching(res[0]);
                                            resolve();
                                        }).catch((e) => {
                                            this.movePageBackwards();
                                            console.log(e);
                                            this.authenticationProvider.clearCredential(this);
                                            alert("An error occured, please try again");
                                        });

                                    } else {
                                        reject("Error from Google");
                                    }
                                }
                            })
                            .build();
                    picker.setVisible(true);
                };
                this.tokenClient.callback = async (response) => {
                    if (response.error !== undefined) {
                        reject("Failed to authenticate");
                    }
                    accessToken = response.access_token;
                    this.authenticationProvider.addCredential(this, accessToken);
                    showPicker();
                };
                if (!accessToken && !this.authenticationProvider.hasCredential(this)) {
                    // Prompt the user to select a Google Account and ask for consent to share their data
                    // when establishing a new session.
                    this.tokenClient.requestAccessToken({prompt: 'consent'});
                } else {
                    // Skip display of account chooser and consent dialog for an existing session.
                    accessToken = this.authenticationProvider.getCredential(this);
                    showPicker();
                    //this.tokenClient.requestAccessToken({prompt: ''});
                }
            });
        });
    }

    //A forms-specific method to match based on field names
    performGoogleFormsMatching(formInformation) {
        var match = {};
        //Make sure data is correct format
        if (formInformation['items'] && Array.isArray(formInformation['items'])) {
            //Loop all elements in the form
            formInformation['items'].forEach((formItem) => {
                if (formItem['questionItem'] && formItem['questionItem']['question']) {
                    let questionText = formItem['title'];
                    let questionIdentifier = formItem['questionItem']['question']['questionId'];
                    //Go over each potential field and look for a match
                    let matchedFieldName = null;
                    this.sheetInformation.fields.forEach((fieldName) => {
                        let fieldInfo = this.fieldData[fieldName];
                        if (fieldInfo['Display']) {
                            for (const text of Object.values(fieldInfo['Display'])) {
                                if (this.stripFieldName(text).includes(this.stripFieldName(questionText))) {
                                    if (matchedFieldName === null) {
                                        //First match, note it
                                        matchedFieldName = fieldName;
                                    } else {
                                        //Two matches occured, don't indicate
                                        matchedFieldName = null;
                                        break;
                                    }
                                }
                            }
                        }
                    });
                    //A single field matched
                    if (matchedFieldName !== null) {
                        match[matchedFieldName] = questionIdentifier;
                    }
                }
            });
        }
        return match;
    }

    //Convert JSON into a ResponseContainer & Return
    getResponseContainer() {
        let container = super.getResponseContainer();
        container.setMatching(this.internalMatching);
        if (this.JsonResults['responses']) {
            this.JsonResults['responses'].forEach((entry) => {
                let timestamp = new Date(entry['lastSubmittedTime']).getTime();
                let responseObj = new Response(timestamp);
                let answerListing = entry['answers'];
                for (const[key, answer] of Object.entries(answerListing)) {
                    responseObj.addAnswer(new Answer(answer['textAnswers']['answers'][0]['value'], answer['questionId']));
                }
                container.addResponse(responseObj);
            });
        }
        return container;
    }
}
;