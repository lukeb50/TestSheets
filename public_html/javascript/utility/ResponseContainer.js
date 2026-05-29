/* global jsFieldValueModifications, fieldData */

class ResponseContainerBuilder {
    sheetInformation;
    fieldData;

    dbKey;
    saveStatus;

    jsonData;

    setSheetInformation(sheetInformation) { this.sheetInformation = sheetInformation; return this; }
    setFieldData(fieldData) { this.fieldData = fieldData; return this; };
    setDbKey(dbKey) { this.dbKey = dbKey; return this; };
    setSaveStatus(saveStatus) { this.saveStatus = saveStatus; return this; };
    setJsonData(jsonData) { this.jsonData = jsonData; return this; };

    build() {
        if (this.sheetInformation && this.fieldData && this.dbKey !== undefined && this.saveStatus && this.jsonData) {
            let container = new ResponseContainer(this.sheetInformation, this.fieldData, this.saveStatus, this.dbKey);
            this._loadJsonValues(container, this.jsonData);
            return container;
        }
        throw new Error("Build parameters not set");
    }

    _loadJsonValues(responseObj, { version, label, candidateCount, sheetId, matching, excludedFields, includedQuestions, responses, createdAt, modifiedAt, toolkitModifiedAt, toolkitMapping } = {}) {
        this._extractSheetInfo(responseObj, sheetId);
        responseObj.version = version;
        responseObj.label = label;
        responseObj.candidateCount = candidateCount;
        responseObj.createdAt = createdAt;
        responseObj.modifiedAt = modifiedAt;
        responseObj.toolkitModifiedAt = toolkitModifiedAt;
        responseObj.matching = matching;
        responseObj.excludedFields = excludedFields;
        responseObj.includedQuestions = new Set(includedQuestions);
        responseObj.responses = Object.fromEntries(Object.entries(responses).map(([k, v]) => [k, Response.fromJson(v)]));
        responseObj.toolkitMapping = toolkitMapping ?? {};
    }

    _extractSheetInfo(responseObj, sheetId) {
        var sheetInfo = Object.entries(this.sheetInformation)
            .flatMap(([categoryName, categoryContentArray]) => categoryContentArray)
            .find(entry => entry.identifier === sheetId);
        responseObj.sheetInformation = sheetInfo;
    }

    buildNewEmpty() {
        if (this.sheetInformation && this.fieldData) {
            let container = new ResponseContainer(this.sheetInformation, this.fieldData, SAVE_STATUS.INITIAL_UNSAVED, null);
            container.markNewCreation();
            return container;
        }
        throw new Error("Build parameters not set");
    }

}

class ResponseContainer {
    version = 1;
    dbKey = null;
    label = "";
    candidateCount = 0;
    responses = {};
    includedQuestions = new Set();
    sourceHeaders = {};//FieldName: QuestionId
    matching = {}; //FieldName: QuestionId
    excludedFields = [];
    toolkitMapping = {};

    modifiedAt;
    toolkitModifiedAt;
    createdAt;
    saveStatus;

    sheetInformation;
    fieldData;

    timeService;

    constructor(sheetInformation, fieldData, saveStatus, dbKey = null) {
        this.sheetInformation = sheetInformation;
        this.fieldData = fieldData;
        this.dbKey = dbKey;
        this.setSaveStatus(saveStatus);

        this.timeService = new ServerTimeService();
    }

    setSaveStatus(saveStatus) {
        this.saveStatus = saveStatus;
    }

    assignKey() {
        if (!this.dbKey) {
            this.dbKey = self.crypto.randomUUID();
            this.markModified();
        }
        return this.dbKey;
    }

    setLabel(lbl) {
        this.label = lbl;
    }

    async markModified() {
        this.modifiedAt = await this.timeService.getActualTime();
        this.candidateCount = Object.keys(this.responses).length;
    }

    async markToolkitModified() {
        this.toolkitModifiedAt = await this.timeService.getActualTime();
    }

    async markNewCreation() {
        this.createdAt = await this.timeService.getActualTime();
        this.modifiedAt = await this.timeService.getActualTime();
        this.markToolkitModified();
        return this;
    }

    getToolkitMapping() {
        return this.toolkitMapping ?? {};
    }

    /**
     * Returns the underlying identifier of the sheet this container represents, such as "NLRecert2020";
     * @returns {String} value
     */
    getSheetIdentifier() {
        return this.sheetInformation.identifier;
    }

    getFieldNameFromQuestionId(questionId) {
        return Object.keys(this.matching).find(key => this.matching[key] === questionId);
    }

    removeResponse(responseId) {
        delete this.responses[responseId];
    }

    addResponse(response) {
        let responseId = ResponseContainer.generateUniqueId((potentialId) => Object.keys(this.responses).includes(potentialId));
        this.responses[responseId] = response;
        this.includedQuestions = this.includedQuestions.union(response.getQuestionsIncluded());
        return responseId;
    }

    //Add a new, empty response (for new response button)
   async addEmptyResponse() {
        let newResponse = new Response(await this.timeService.getActualTime());
        this.includedQuestions.forEach((questionId) => {
            let newAnswer = new Answer("", questionId);
            newResponse.addAnswer(newAnswer);
        });
        return this.addResponse(newResponse);
    }

    //Add an empty answer to each existing response (for new column button)
    addEmptyAnswer() {
        let questionId = ResponseContainer.generateUniqueId((potentialId) => this.includedQuestions.has(potentialId));
        this.includedQuestions.add(questionId);
        for (const [responseId, response] of Object.entries(this.responses)) {
            let newQuestionObj = new Answer("", questionId);
            response.addAnswer(newQuestionObj);
        }
        return questionId;
    }

    setMatching(matching) {
        this.matching = matching;
    }

    setHeaders(headerInfo) {
        this.sourceHeaders = headerInfo;
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
                let missingQuestions = this.includedQuestions.difference(response.getQuestionsIncluded());
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
        this.matching = {};
        var usedFields = this.sheetInformation.fields;
        //Include any dividable fields
        if (this.sheetInformation['DividablesToInclude']) {
            usedFields = usedFields.concat(this.sheetInformation['DividablesToInclude']);
        }
        //Include any combinable fields
        if (this.sheetInformation["CombinablesToInclude"]) {
            this.sheetInformation["CombinablesToInclude"].forEach((combinable) => {
                usedFields = usedFields.concat(fieldData[combinable].CombinedFormatting.FieldsToInclude);
            });
        }
        let usedQuestions = Array.from(this.includedQuestions);
        var prerequisiteMatching = matchPrerequisiteFields(this);
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
        //Remove any entries that conflict with the unique flag
        for (var f = 0; f < usedFields.length; f++) {
            let fieldData = this.fieldData[usedFields[f]];
            //Unique Flag Present
            if (Object.hasOwn(fieldData, "isUniqueMatch") && fieldData['isUniqueMatch'] === true) {
                //Go through each non-zero value and check for compliance
                for (var a = 0; a < usedQuestions.length; a++) {
                    if (matchingMatrix[a][f] > 0) {
                        var questionId = usedQuestions[a];
                        //No value can appear more than 3 times || (represent more than 15% or entries with 20 or more responses)
                        let valueCounts = {};
                        //Loop each answer and count how many times each value occurs
                        for (const [responseId, response] of Object.entries(this.getResponses())) {
                            let respValue = response.getAnswer(questionId).answerContent.trim().toUpperCase();
                            if (respValue && respValue !== "") {
                                //Tally non-empty values
                                if (valueCounts[respValue]) {
                                    valueCounts[respValue]++;
                                } else {
                                    valueCounts[respValue] = 1;
                                }
                            }
                        }
                        ;
                        let entryCounts = Object.values(valueCounts);
                        if (entryCounts.some((count) => count > 3) || (this.getNumberOfResponses >= 20 &&
                            entryCounts.some((count) => count / this.getNumberOfResponses() >= 0.15))) {
                            matchingMatrix[a][f] = 0;
                        }
                    }
                }
            }
        }
        //Remove any entries that conflict with prerequisite matching
        for (const [prereqFieldName, questionId] of Object.entries(prerequisiteMatching)) {
            var questionRow = matchingMatrix[usedQuestions.indexOf(questionId)];
            for (var i = 0; i < questionRow.length; i++) {
                questionRow[i] = 0;
            }
        }
        //Go through each field and find which QuestionId fits best
        for (var i = 0; i < usedFields.length; i++) {
            //Get 2and dimention of the 2d matching array
            let arr = matchingMatrix.reduce((acc, currentVal) => {
                acc.push(currentVal[i]);
                return acc;
            }, []);
            let index = findMaximumUniqueIndex(arr);
            if (index !== -1) {
                clearDuplicativeEntry(usedQuestions[index], this.matching);
                this.matching[usedFields[i]] = usedQuestions[index];
            }
        }
        //Combine with prereqs
        this.matching = { ...this.matching, ...prerequisiteMatching };

        //Removes any entries that would duplicate the new matching (such as from Google Forms text matching)
        function clearDuplicativeEntry(questionId, matchingObj) {
            for (const [fieldName, qId] of Object.entries(matchingObj)) {
                if (qId === questionId) {
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


        function matchPrerequisiteFields(ctx) {
            var matchedPairs = {};
            const dateRegex = new RegExp(/^(?<year>\d{2,4})-(?<month>\d{2})-(?<day>\d{2})$/);
            const prereqFields = [{
                Name: "Date", MatchingFunction: function (val) {
                    return dateRegex.test(val.toString().trim());
                }
            }, {
                Name: "Location", MatchingFunction: function (val) {
                    return !dateRegex.test(val.toString().trim());
                }
            }];
            //Check if needed, otherwise return an empty matching object
            if (!ctx.sheetInformation.prerequisites || !ctx.sheetInformation.prerequisites.courses) {
                return {};
            }
            var prerequisites = ctx.sheetInformation.prerequisites.courses;
            //Create a matching table, each header has a slot for each possible prerequisite field option (date,location,etc)
            var matchingArr = Array(ctx.includedQuestions.size).fill().map(() => Array(prereqFields.length).fill(0));
            //Go over each answer value and check it against each prerequisite check function
            for (const [responseId, response] of Object.entries(ctx.responses)) {
                response.getAnswers().forEach((answer) => {
                    var answerI = [...ctx.includedQuestions].indexOf(answer.questionIdentifier);
                    var answerTxt = answer.answerContent;
                    //Short-circuit if no content
                    if (answerTxt && answerTxt !== "") {
                        prereqFields.forEach((prereqFieldInfo, prereqI) => {
                            if (prereqFieldInfo.MatchingFunction(answerTxt)) {
                                //Matches, increment counter
                                matchingArr[answerI][prereqI]++;
                            } else {
                                //Has a value that matches, decrement counter
                                matchingArr[answerI][prereqI]--;
                            }
                        });
                    }
                });
            }
            //check each header for a name match
            var eligibleHeaders = [];
            var eligibleHeadersIds = [];
            for (const [questionId, headerText] of Object.entries(ctx.sourceHeaders)) {
                //Find any prerequisites name match with the headers
                var viablePrerequisites = prerequisites.filter((prereqName) => trimCaseName(headerText).includes(trimCaseName(prereqName)));
                viablePrerequisites = viablePrerequisites.length === 1 ? viablePrerequisites : [];
                //Only consider a single match
                if (viablePrerequisites.length === 1) {
                    //This header is viable
                    eligibleHeadersIds.push(questionId);
                    eligibleHeaders.push({ questionId: questionId, prerequisiteIndex: prerequisites.indexOf(viablePrerequisites[0]) });
                }
            }
            //perform final matching
            //Get a list of sheet prerequisites that have a header match
            let eligiblePrereqs = prerequisites.filter((n, prerequisiteIndex) => eligibleHeaders.some((entry) => entry.prerequisiteIndex === prerequisiteIndex));
            eligiblePrereqs.forEach((eligiblePrereqName) => {
                var prereqI = prerequisites.indexOf(eligiblePrereqName);
                //For each field type, find the best match and assign
                prereqFields.forEach((prereqFieldInfo, prereqFieldI) => {
                    //Find the highest unique index that meets the minimum where the header name matches
                    var foundRowQuestionId = null;
                    var maxValue = 0;
                    matchingArr.forEach((rowEntry, rowI) => {
                        //Check if this row is a header match for this prereq
                        let rowQuestionId = [...ctx.includedQuestions][rowI];
                        //This row has already been flagged as having an appropriate header
                        if (eligibleHeaders.some((headerInfo) => headerInfo.prerequisiteIndex === prereqI && headerInfo.questionId === rowQuestionId)) {
                            let val = rowEntry[prereqFieldI];
                            //New highest value with a positive score
                            //This function is non-determinisitc if two rows have the same score for the same prerequisite name
                            if (val > maxValue) {
                                maxValue = val;
                                foundRowQuestionId = rowQuestionId;
                            }
                        }
                    });
                    //If the check turned up an entry, mark it
                    if (foundRowQuestionId) {
                        matchedPairs["Prereq" + (prereqI + 1) + prereqFieldInfo.Name] = foundRowQuestionId;
                    }
                });
            });
            return matchedPairs;
        }

        function trimCaseName(value) {
            return value.toUpperCase().trim().replaceAll(" ", "");
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
            if (questionId && fieldData[dividedField]['DivisibleFields']) {
                //Loop each response & get the original answer
                let fieldsToUpdate = Object.keys(fieldData[dividedField]["DivisibleFields"]);
                for (const [responseId, response] of Object.entries(this.getResponses())) {
                    let undividedAnswer = response.getAnswer(questionId);
                    //Make a regexp for the division
                    let regexp = new RegExp(fieldData[dividedField]['RegexMatch']);
                    let matchResult = undividedAnswer.getFormattedAnswer(dividedField, this.sheetInformation).match(regexp);
                    //Get list of fields that need to be updated
                    //For each field, either find them in matching or create a new answer
                    if (matchResult) {
                        fieldsToUpdate.forEach((field) => {
                            let substituteText = matchResult.groups[fieldData[dividedField]["DivisibleFields"][field]];
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
                                let questionId = ResponseContainer.generateUniqueId((generatedId) => {
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

    mergeCombinedFields() {
        if (!this.sheetInformation['CombinablesToInclude']) {
            return;
        }
        //For each field to combine into
        this.sheetInformation['CombinablesToInclude'].forEach((combinableField) => {
            ///Check if all the required fields are defined
            var componentFields = fieldData[combinableField].CombinedFormatting.FieldsToInclude;
            if (componentFields.every((field) => this.matching[field] ? true : false)) {
                //For each response
                for (const [responseId, response] of Object.entries(this.getResponses())) {
                    //Create a matching array of answer values
                    var answersArray = new Array(componentFields.length);
                    componentFields.forEach((field, i) => {
                        let fieldId = this.matching[field];
                        answersArray[i] = response.getAnswer(fieldId).getFormattedAnswer(field, this.sheetInformation);
                    });
                    //Check that all values have a string answer
                    if (answersArray.every((response) => response && response !== "")) {
                        //Create the combined string
                        var baseString = fieldData[combinableField].CombinedFormatting.FormattedString;
                        componentFields.forEach((fieldName, i) => {
                            baseString = baseString.replace("<" + fieldName + ">", answersArray[i]);
                        });
                        //Check if the combined field is already assigned
                        var combinedAnswerFieldId = this.matching[combinableField];
                        if (combinedAnswerFieldId) {
                            if (response.getAnswer(combinedAnswerFieldId)) {
                                response.getAnswer(combinedAnswerFieldId).answerContent = baseString;
                            } else {
                                response.addAnswer(new Answer(baseString, combinedAnswerFieldId));
                            }
                        } else {
                            //Create a new answer id & integrate it
                            let questionId = ResponseContainer.generateUniqueId((generatedId) => {
                                return this.includedQuestions.has(generatedId);
                            });
                            this.includedQuestions.add(questionId);
                            this.matching[combinableField] = questionId;
                            response.addAnswer(new Answer(baseString, questionId));
                        }
                    }
                }
            }
        });
    }

    //Gets all showable fields for the sheet, including dividables and combinables.
    getFullFieldsList() {
        let fields = this.sheetInformation.fields;
        this.excludedFields = [];
        //Dividables
        if (this.sheetInformation["DividablesToInclude"]) {
            fields = fields.concat(this.sheetInformation.DividablesToInclude);
            this.sheetInformation.DividablesToInclude.forEach((divisibleField) => {
                //Remove any field that gets divided into.
                Object.keys(fieldData[divisibleField]['DivisibleFields']).forEach((componentField) => {
                    fields.splice(fields.indexOf(componentField), 1);
                    this.excludedFields.push(componentField);
                });
            });
        }
        //Combinables
        if (this.sheetInformation["CombinablesToInclude"]) {
            this.sheetInformation["CombinablesToInclude"].forEach((combinable) => {
                //Add the component fields
                fields = fields.concat(fieldData[combinable].CombinedFormatting.FieldsToInclude);
                //Remove the actual combinable field
                fields.splice(fields.indexOf(combinable), 1);
                this.excludedFields.push(combinable);
            });
        }
        //Prerequisite fields
        if (this.sheetInformation.prerequisites && this.sheetInformation.prerequisites.courses) {
            for (var i = 1; i <= this.sheetInformation.prerequisites.courses.length; i++) {
                fields.push("Prereq" + i + "Location");
                fields.push("Prereq" + i + "Date");
            }
        }
        return fields;
    }

    //Generates a random ID that is unique. Requires a function that takes in the generated ID
    //and returns whether it is a duplicate
    static generateUniqueId(isDuplicateFunction) {
        let generatedId = Math.random().toString(36).slice(2);
        //If the ID already exists, recursively generate a new one until unique
        if (isDuplicateFunction(generatedId) || generatedId.length === 0) {
            return ResponseContainer.generateUniqueId(isDuplicateFunction);
        } else {
            return generatedId;
        }
    }

    responses = {};

    toJson() {
        return {
            key: this.dbKey, data: {
                version: this.version,
                label: this.label,
                candidateCount: this.candidateCount,
                sheetId: this.getSheetIdentifier(),
                createdAt: this.createdAt,
                modifiedAt: this.modifiedAt,
                toolkitModifiedAt: this.toolkitModifiedAt,
                matching: this.matching,
                excludedFields: this.excludedFields,
                includedQuestions: [...this.includedQuestions],
                responses: Object.fromEntries(Object.entries(this.responses).map(([k, v]) => [k, v.toJson()])),
                toolkitMapping: this.toolkitMapping
            }
        }
    }
}

class Response {
    answers = [];
    timestamp = 0;

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
    }

    getQuestionsIncluded() {
        return new Set(this.answers.map((answer) => answer.questionIdentifier));
    }

    getTimestamp() {
        return this.timestamp;
    }

    toJson() {
        return {
            timestamp: this.timestamp,
            answers: this.answers.map((answer) => answer.toJson())
        }
    }

    static fromJson({ timestamp, answers } = {}) {
        var result = new Response(timestamp);
        result.answers = answers.map((answerJson) => Answer.fromJson(answerJson));
        return result;
    }
}

class Answer {
    answerContent = "";
    questionIdentifier;

    constructor(content, questionId) {
        this.answerContent = content;
        this.questionIdentifier = questionId;
    }

    getFormattedAnswer(fieldBeingApplied, sheetInformation) {
        if (sheetInformation['ModificationsToApply'] && sheetInformation['ModificationsToApply'][fieldBeingApplied]) {
            var isMultipleModifications = Array.isArray(sheetInformation['ModificationsToApply'][fieldBeingApplied]);
            var formattedText = this.answerContent.trim();
            for (var i = 0; i < (isMultipleModifications ? sheetInformation['ModificationsToApply'][fieldBeingApplied].length : 1); i++) {
                //Pick either the whole text if single, or the ith element in the modifcations array if multiple apply
                let modificationName = isMultipleModifications ? sheetInformation['ModificationsToApply'][fieldBeingApplied][i] : sheetInformation['ModificationsToApply'][fieldBeingApplied];
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
            return this.answerContent.trim();
        }
    }

    toJson() {
        return {
            answerContent: this.answerContent,
            questionIdentifier: this.questionIdentifier
        }
    }

    static fromJson({ answerContent, questionIdentifier } = {}) {
        return new Answer(answerContent, questionIdentifier);
    }
}