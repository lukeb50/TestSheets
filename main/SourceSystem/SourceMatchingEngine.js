class SourceMatchingEngine {
    currentFieldData;
    currentSheetData;

    sheetIdentifier;

    rawData;

    activeStrategies = [];
    activeStrategiesWeights = [];

    constructor(rawDataInstance, sheetIdentifier, FieldData) {
        this.rawData = rawDataInstance;
        this.currentSheetData = getSheetFromIdentifier(sheetIdentifier);
        this.currentFieldData = FieldData;
        this.sheetIdentifier = sheetIdentifier;
        this.#loadStrategies();
    }

    #loadStrategies() {
        this.#loadStrategy(new PrerequisiteMatchingStrategy(), 1);
        this.#loadStrategy(new HeaderMatchingStrategy(), 0.75);
        this.#loadStrategy(new ResponseMatchingStrategy(), 0.6);
    }

    #loadStrategy(strategyInstance, strategyWeight) {
        this.activeStrategies.push(strategyInstance);
        this.activeStrategiesWeights.push(strategyWeight);
    }

    performMatching() {
        let availableFields = Array.from(new Set(this.#getIncludedFields()));
        let availableQuestions = Array.from(this.rawData.getAllUsedQuestionIds());
        //Create the matching matrix 
        var matchMatrix = Array(availableFields.length).fill().map(() => Array(availableQuestions.length).fill(0));
        //apply the matching
        this.activeStrategies.forEach((strategyObject, strategyI) => {
            availableFields.forEach((fieldName, fI) => {
                let currentField = this.currentFieldData[fieldName];
                availableQuestions.forEach((questionId, qI) => {
                    if (matchMatrix[fI][qI] === Number.MAX_SAFE_INTEGER) {
                        //Short circuit the attempt if a final decision is made
                        return;
                    }
                    let questionHeader = this.rawData.getHeader(questionId);
                    let questionResponses = this.rawData.getResponses().map((response) => response.getAnswer(questionId));
                    let score = strategyObject.matchQuestion(this.currentSheetData, currentField, questionHeader, questionResponses) * this.activeStrategiesWeights[strategyI];
                    matchMatrix[fI][qI] += score;
                })
            })
        })
        //Take the matrix and extract the final matching
        let matchingInformation = {}; //Name: questionId
        let activeQuestionIds = new Set();
        matchMatrix.forEach((fieldRow, fieldI) => {
            let maxValue = Math.max(...fieldRow);
            if (maxValue < 0.6) {//Confidence threshold
                return;
            }
            let questionIndex = fieldRow.indexOf(maxValue);
            let questionId = availableQuestions[questionIndex];
            //Check - if the question id is already assigned to a field, a tie has happened. Clear both and let the user decide.
            if (activeQuestionIds.has(questionId)) {
                let conflictingName = Object.entries(matchingInformation).find(([k, v]) => v === questionId)[0];
                delete matchingInformation[conflictingName];
            }
            matchingInformation[availableFields[fieldI]] = questionId;
            activeQuestionIds.add(questionId);
        })
        return matchingInformation;
    }

    //Reads the field data and returns all possible fields to be matched
    #getIncludedFields() {
        return new SheetInterpreter(this.rawData, this.fieldData, this.currentSheetData).getFullFields();
    }
}