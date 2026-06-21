class SheetContainerBuilder {

    dbKey;
    saveStatus;

    jsonData;

    setDbKey(dbKey) { this.dbKey = dbKey; return this; };
    setSaveStatus(saveStatus) { this.saveStatus = saveStatus; return this; };
    setJsonData(jsonData) { this.jsonData = jsonData; return this; };

    build() {
        if (this.dbKey !== undefined && this.saveStatus && this.jsonData) {
            let container = new SheetContainer(this.saveStatus, this.dbKey);
            this._loadJsonValues(container, this.jsonData);
            this.#loadIncludedQuestions(container);
            return container;
        }
        throw new Error("Build parameters not set");
    }

    _loadJsonValues(responseObj, { version, label, candidateCount, sheetId, matching, excludedFields, includedQuestions, responses, createdAt, modifiedAt, toolkitModifiedAt, toolkitMapping } = {}) {
        responseObj.sheetId = sheetId;
        responseObj.version = version;
        responseObj.label = label;
        responseObj.candidateCount = candidateCount;
        responseObj.createdAt = createdAt;
        responseObj.modifiedAt = modifiedAt;
        responseObj.toolkitModifiedAt = toolkitModifiedAt;
        responseObj.matching = matching;
        responseObj.responses = Object.fromEntries(Object.entries(responses).map(([k, v]) => [k, Response.fromJson(k, v)]));
        responseObj.toolkitMapping = toolkitMapping ?? {};
    }

    #loadIncludedQuestions(container) {
        let includedQuestions = new Set();
        container.getResponses().forEach((response) => {
            let responseQuestionIds = new Set(response.getAnswers().map((answer) => answer.questionId));
            includedQuestions = includedQuestions.union(responseQuestionIds);
        });
        container.includedQuestions = includedQuestions;
    }

    buildNewEmpty(sheetId) {
        let container = new SheetContainer(SAVE_STATUS.INITIAL_UNSAVED, null);
        container.markNewCreation();
        container.sheetId = sheetId;
        return container;
    }

    buildFromRaw(rawData, matchingData, sheetId) {
        let container = this.buildNewEmpty(sheetId);
        container.matching = matchingData;
        rawData.getResponses().forEach((rawResponse) => {
            container.addResponse(Response.fromResponse(rawResponse, Answer))
        })
        container.candidateCount = rawData.getResponses().length;
        this.#loadIncludedQuestions(container);
        return container;
    }

}