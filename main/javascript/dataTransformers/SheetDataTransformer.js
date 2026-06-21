class BaseSheetTransformer {
    currentSheetData;
    fieldData;
    sheet;
    constructor(sheetInstance, currentSheetData, fieldData) {
        this.currentSheetData = currentSheetData;
        this.fieldData = fieldData;
        this.sheet = sheetInstance;
    }

    execute() {
        throw new Error("Unimplemented");
    }
}

class FieldModificationSheetTransformer extends BaseSheetTransformer {
    static MODIFICATION_STAGE = { LOAD: 'ModificationsToApply', GENERATION: 'GenerationModificationsToApply' };
    execute(stage = FieldModificationSheetTransformer.MODIFICATION_STAGE.LOAD) {
        this.sheet.getResponses().forEach((response) => {
            response.getAnswers().forEach((answer) => {
                //Find the name of the field that corresponds to this answer
                let associatedField = Object.entries(this.sheet.matching).find(([fieldName, questionId]) => questionId === answer.questionId)?.at(0);
                if (!associatedField) {
                    return;
                }
                answer.setContent(this.#formatFieldAnswer(associatedField, answer.getContent(), stage));
            })
        })
    }

    #formatFieldAnswer(fieldBeingApplied, text, stage) {
        if (this.currentSheetData[stage] && this.currentSheetData[stage][fieldBeingApplied]) {
            var isMultipleModifications = Array.isArray(this.currentSheetData[stage][fieldBeingApplied]);
            var formattedText = text.trim();
            for (var i = 0; i < (isMultipleModifications ? this.currentSheetData[stage][fieldBeingApplied].length : 1); i++) {
                //Pick either the whole text if single, or the ith element in the modifcations array if multiple apply
                let modificationName = isMultipleModifications ? this.currentSheetData[stage][fieldBeingApplied][i] : this.currentSheetData[stage][fieldBeingApplied];
                if (fieldData[fieldBeingApplied]['FieldValueModifications'] && fieldData[fieldBeingApplied]['FieldValueModifications'][modificationName]) {
                    if (fieldData[fieldBeingApplied]['FieldValueModifications'][modificationName].length === 2) {
                        //Encoded JSON modification
                        let modificationDetails = fieldData[fieldBeingApplied]['FieldValueModifications'][modificationName];
                        formattedText = formattedText.replaceAll(new RegExp(modificationDetails[0], "g"), modificationDetails[1]);
                    } else {
                        //Reference JSON modification
                        formattedText = jsFieldValueModifications[fieldBeingApplied][modificationName](formattedText);
                    }
                }
            }
            return formattedText;
        } else {
            return text.trim();
        }
    }
}

class MergeDivideSheetTransformer extends BaseSheetTransformer {
    execute() {
        //Copy the responses & matching
        let responses = [];
        let matching = { ...this.sheet.matching };
        this.sheet.getResponses().forEach((response) => {
            responses.push(SheetTransformerResponse.fromResponse(response, SheetTransformerAnswer));
        })
        //Apply
        this.splitDividedFields(responses, matching);
        this.mergeCombinedFields(responses, matching);
        return new SheetTransformerSheetOutput(responses, matching);
    }

    splitDividedFields(responses, matching) {
        var genCount = 0;
        if (!this.currentSheetData['DividablesToInclude']) {
            return;
        }
        //For each field to divide
        this.currentSheetData['DividablesToInclude'].forEach((dividedField) => {
            //Make sure that we know which QuestionId represents it
            let questionId = matching[dividedField];
            //Ensure questionID is known and a division is defined
            if (questionId && fieldData[dividedField]['DivisibleFields']) {
                //Loop each response & get the original answer
                let fieldsToUpdate = Object.keys(fieldData[dividedField]["DivisibleFields"]);
                for (const response of responses) {
                    let undividedAnswer = response.getAnswer(questionId);
                    //Make a regexp for the division
                    let regexp = new RegExp(fieldData[dividedField]['RegexMatch']);
                    let matchResult = undividedAnswer.getContent().match(regexp);
                    //Get list of fields that need to be updated
                    //For each field, either find them in matching or create a new answer
                    if (matchResult) {
                        fieldsToUpdate.forEach((field) => {
                            let substituteText = matchResult.groups[fieldData[dividedField]["DivisibleFields"][field]];
                            let questionId = matching[field];
                            if (questionId) {
                                //Update an existing answer, or if this is not the first response, create an answer object
                                let answer = response.getAnswer(questionId);
                                if (answer) {
                                    //Only updating a pre-existing answer
                                    answer.setContent(substituteText);
                                } else {
                                    //A new question is being added since the QuestionId has been added to the container but the response
                                    //object does not have an answer attached
                                    response.addAnswer(new Answer(questionId, substituteText));

                                }
                            } else {
                                //Create a new answer & Integrate it in the container
                                let questionId = `%generatedID${genCount}`
                                genCount++;
                                matching[field] = questionId;
                                response.addAnswer(new Answer(questionId, substituteText));
                            }
                        });
                    }
                }
            }
        });
    }

    mergeCombinedFields(responses, matching) {
        var genCount = 0;
        if (!this.currentSheetData['CombinablesToInclude']) {
            return;
        }
        //For each field to combine into
        this.currentSheetData['CombinablesToInclude'].forEach((combinableField) => {
            ///Check if all the required fields are defined
            var componentFields = fieldData[combinableField].CombinedFormatting.FieldsToInclude;
            if (componentFields.every((field) => matching[field] ? true : false)) {
                //For each response
                for (const response of responses) {
                    //Create a matching array of answer values
                    var answersArray = new Array(componentFields.length);
                    componentFields.forEach((field, i) => {
                        let fieldId = matching[field];
                        answersArray[i] = response.getAnswer(fieldId)?.getContent() ?? null;
                    });
                    //Check that all values have a string answer
                    if (answersArray.every((response) => response && response !== "")) {
                        //Create the combined string
                        var baseString = fieldData[combinableField].CombinedFormatting.FormattedString;
                        componentFields.forEach((fieldName, i) => {
                            baseString = baseString.replace("<" + fieldName + ">", answersArray[i]);
                        });
                        //Check if the combined field is already assigned
                        var combinedAnswerFieldId = matching[combinableField];
                        if (combinedAnswerFieldId) {
                            if (response.getAnswer(combinedAnswerFieldId)) {
                                response.getAnswer(combinedAnswerFieldId).setContent(baseString);
                            } else {
                                response.addAnswer(new Answer(combinedAnswerFieldId, baseString));
                            }
                        } else {
                            //Create a new answer id & integrate it
                            let questionId = `%generatedID${genCount}`
                            genCount++;
                            matching[combinableField] = questionId;
                            response.addAnswer(new Answer(questionId, baseString));
                        }
                    }
                }
            }
        });
    }
}

class SheetTransformerSheetOutput {
    responses;
    matching;
    constructor(responses, matching) {
        this.responses = responses;
        this.matching = matching;
    }

    getResponses() {
        return this.responses;
    }
}

class SheetTransformerResponse extends BaseResponse {
}

class SheetTransformerAnswer extends BaseAnswer {

}