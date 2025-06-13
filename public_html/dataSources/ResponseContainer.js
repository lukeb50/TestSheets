class ResponseContainer {
    responses = {};
    includedQuestions = new Set();
    matching = {};
    isForcedMatch = false;
    
    sheetInformation;
    fieldData;

    constructor(sheetInformation,fieldData) {
        this.sheetInformation = sheetInformation;
        this.fieldData = fieldData;
    }

    addResponse(response) {
        let responseId = this.generateUniqueId((potentialId) => Object.keys(this.responses).includes(potentialId));
        this.responses[responseId] = response;
        this.includedQuestions = this.includedQuestions.union(response.questionsIncluded);
        return responseId;
    }

    //Add a new, empty response (for new response button)
    addEmptyResponse() {
        let newResponse = new Response(Date.now());
        this.includedQuestions.forEach((questionId) => {
            let newAnswer = new Answer("", questionId);
            newResponse.addAnswer(newAnswer);
        });
        return this.addResponse(newResponse);
    }
    
    //Add an empty answer to each existing response (for new column button)
    addEmptyAnswer(){
        let questionId = this.generateUniqueId((potentialId) => this.includedQuestions.has(potentialId));
        this.includedQuestions.add(questionId);
        for (const [responseId, response] of Object.entries(this.responses)) {
            let newQuestionObj = new Answer("",questionId);
            response.addAnswer(newQuestionObj);
        }
        return questionId;
    }

    setMatching(matching) {
        this.matching = matching;
    }

    makeForcedMatch() {
        this.isForcedMatch = true;
    }

    getNumberOfResponses() {
        return Object.keys(this.responses).length;
    }

    getNumberOfQuestions() {
        return this.includedQuestions.size;
    }

    normalizeResponses() {
        for (const [responseId, response] of Object.entries(this.responses)) {
            if (response.answers.length !== this.includedQuestions.size) {
                //Add missing questions
                let missingQuestions = this.includedQuestions.difference(response.questionsIncluded);
                missingQuestions.forEach((question) => {
                    response.addAnswer(new Answer("", question));
                });
            }
        }
    }

    getFilteredResponses(timeStart, timeEnd) {
        this.normalizeResponses();
        let filteredResponses = {};
        for (const [responseId, response] of Object.entries(this.responses)) {
            if (response.getTimestamp() >= timeStart && response.getTimestamp() <= timeEnd) {
                filteredResponses[responseId] = response;
            }
        }
        return filteredResponses;
    }

    getResponses() {
        return this.getFilteredResponses(0, Number.MAX_SAFE_INTEGER);
    }

    getResponse(responseId) {
        return this.responses[responseId];
    }

    matchQuestionFields() {
        if (this.getNumberOfResponses() === 0) {
            alert("No responses found.");
            return;
        }
        let usedFields = this.sheetInformation.fields;
        //Include any dividable fields
        if (this.sheetInformation['DividablesToInclude']) {
            usedFields = usedFields.concat(this.sheetInformation['DividablesToInclude']);
        }
        let usedQuestions = Array.from(this.includedQuestions);
        const matchingMatrix = Array(usedQuestions.length).fill().map(() => Array(usedFields.length).fill(0));
        let fieldRegexes = {};
        usedFields.forEach((field) => {
            if (!Object.hasOwn(fieldData, field)) {
                alert("The sheet has a misdeclared field. Please contact us so that we can fix this issue.");
                return;
            }
            if (Object.hasOwn(fieldData[field], "RegexMatch")) {
                let regexPattern = new RegExp(fieldData[field]['RegexMatch']);
                fieldRegexes[field] = regexPattern;
            }
        });
        for (const [responseId, response] of Object.entries(this.getResponses())) {
            response.getAnswers().forEach((answer) => {
                let answerText = answer.answerContent;
                let questionId = answer.questionIdentifier;
                for (const [fieldName, regexObj] of Object.entries(fieldRegexes)) {
                    if (regexObj.test(answerText) === true) {
                        matchingMatrix[usedQuestions.indexOf(questionId)][usedFields.indexOf(fieldName)]++;
                    }
                }
            });
        }
        matchingMatrix.forEach((arr, i) => {
            let index = findMaximumUniqueIndex(arr);
            if (index !== -1) {
                clearDuplicativeEntry(usedQuestions[i],this.matching);
                this.matching[usedFields[index]] = usedQuestions[i];
            }
        });
        return this.matching;

        //Removes any entries that would duplicate the new matching (such as from Google Forms text matching)
        function clearDuplicativeEntry(questionId,matchingObj){
            for (const [fieldName, qId] of Object.entries(matchingObj)) {
                if(qId === questionId){
                    delete matchingObj[fieldName];
                    break;
                }
            }
        }
        //Takes an array of integers and returns the index of the highest value, 
        //or -1 if either all are 0 or there is a duplicate maximum
        function findMaximumUniqueIndex(arr) {
            let index = -1;
            let maximumVal = 0;
            arr.forEach((val, i) => {
                if (val > maximumVal) {
                    maximumVal = val;
                    index = i;
                } else if (val === maximumVal) {
                    index = -1;
                }
            });
            return index;
        }
    }

    splitDividedFields() {
        if (!this.sheetInformation['DividablesToInclude']) {
            return;
        }
        //For each field to divide
        this.sheetInformation['DividablesToInclude'].forEach((dividedField) => {
            //Make sure that we know which QuestionId represents it
            let questionId = this.matching[dividedField];
            //Ensure questionID is known and a division is defined
            if (questionId && fieldData[dividedField]['FieldDivision']) {
                //Loop each response & get the original answer
                let fieldsToUpdate = Object.keys(fieldData[dividedField]['FieldDivision']["DivisibleFields"]);
                for (const [responseId, response] of Object.entries(this.getResponses())) {
                    let undividedAnswer = response.getAnswer(questionId);
                    //Make a regexp for the division
                    let regexp = new RegExp(fieldData[dividedField]['RegexMatch']);
                    let matchResult = undividedAnswer.answerContent.match(regexp);
                    //Get list of fields that need to be updated
                    //For each field, either find them in matching or create a new answer
                    if (matchResult) {
                        fieldsToUpdate.forEach((field) => {
                            let substituteText = matchResult.groups[fieldData[dividedField]['FieldDivision']["DivisibleFields"][field]];
                            let questionId = this.matching[field];
                            if (questionId) {
                                //Update an existing answer, or if this is not the first response, create an answer object
                                let answer = response.getAnswer(questionId);
                                if (answer) {
                                    //Only updating a pre-existing answer
                                    answer.answerContent = substituteText;
                                } else {
                                    //A new question is being added since the QuestionId has been added to the container but the response
                                    //object does not have an answer attached
                                    response.addAnswer(new Answer(substituteText, questionId));

                                }
                            } else {
                                //Create a new answer & Integrate it in the container
                                let questionId = this.generateUniqueId((generatedId) => {
                                    return this.includedQuestions.has(generatedId);
                                });
                                this.includedQuestions.add(questionId);
                                this.matching[field] = questionId;
                                response.addAnswer(new Answer(substituteText, questionId));
                            }
                        });
                    }
                }
            }
        });
    }

    //Generates a random ID that is unique. Requires a function that takes in the generated ID
    //and returns whether it is a duplicate
    generateUniqueId(isDuplicateFunction) {
        let generatedId = Math.random().toString(36).slice(2);
        //If the ID already exists, recursively generate a new one until unique
        if (isDuplicateFunction(generatedId) || generatedId.length === 0) {
            return this.generateUniqueId(isDuplicateFunction);
        } else {
            return generatedId;
        }
    }
}

class Response {
    answers = [];
    timestamp = 0;
    questionsIncluded = new Set();
    
    //In milliseconds
    constructor(timestamp) {
        this.timestamp = timestamp;
    }

    getAnswers() {
        return this.answers;
    }

    getAnswer(questionId) {
        return this.answers.find((answer) => answer.questionIdentifier === questionId);
    }

    addAnswer(answer) {
        this.answers.push(answer);
        this.questionsIncluded.add(answer.questionIdentifier);
    }

    getTimestamp() {
        return this.timestamp;
    }
}

class Answer {
    answerContent = "";
    questionIdentifier;

    constructor(content, questionId) {
        this.answerContent = content;
        this.questionIdentifier = questionId;
    }
}