/* global fetch, google */

const autofills = {
    "PostalCode": [
        {
            "RequiredFields": ["City", "Address"],
            "function": function (dataContainer, responseId) {
                return new Promise((resolve, reject) => {
                    var requiredFields = getFieldIds(this.RequiredFields, dataContainer);
                    if (requiredFields) {
                        var response = dataContainer.getResponse(responseId);
                        var cityAnswer = response.getAnswer(requiredFields['City']);
                        var addressAnswer = response.getAnswer(requiredFields['Address']);
                        if (cityAnswer && cityAnswer.answerContent.length > 0 && addressAnswer && addressAnswer.answerContent.length > 0) {
                            //Combine address and city with "Canada" to form a Geocodable address
                            addressFormattedQuery = addressAnswer.answerContent + " " + cityAnswer.answerContent + ", Canada";
                            geocoder = new google.maps.Geocoder();
                            geocoder.geocode({'address': addressFormattedQuery}, function (responses, status) {
                                if (status === 'OK' && responses.length > 0) {
                                    //Process the first response
                                    var result = responses[0];
                                    //Check if the types is an address
                                    if (result['types'].includes('street_address')) {
                                        //Find the postal code
                                        var components = result['address_components'];
                                        let foundComponent = components.find((entry) => entry['types'].includes("postal_code"));
                                        if (foundComponent) {
                                            resolve(foundComponent['long_name']);
                                        } else {
                                            reject("No postal code found");
                                        }
                                    } else {
                                        reject("Not a valid address");
                                    }
                                } else {
                                    reject("Internal Geocoder error");
                                }
                            });
                        } else {
                            reject("The City and Address fields cannot be empty to autocomplete postal code");
                        }
                    } else {
                        reject("The City and Address fields must be assigned to autocomplete postal code");
                    }
                });
            }
        }
    ]
};
function getFieldIds(fieldList, dataContainer) {
    //Enforces precondition that all fields must be assigned
    var result = {};
    var isComplete = true;
    for (var i = 0; i < fieldList.length; i++) {
        let field = fieldList[i];
        let fieldId = dataContainer.matching[field];
        if (fieldId) {
            result[field] = fieldId;
        } else {
            isComplete = false;
        }
    }
    if (isComplete) {
        return result;
    }
    return null;
}