/* global jsFieldValueModifications, fieldData */
class SheetContainer {
    version = 1;
    dbKey = null;
    label = "";
    candidateCount = 0;
    responses = {};
    includedQuestions = new Set();
    matching = {}; //FieldName: QuestionId
    toolkitMapping = {};

    modifiedAt;
    toolkitModifiedAt;
    createdAt;
    saveStatus;

    sheetId;

    timeService;

    constructor(saveStatus, dbKey = null) {
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
        return this.sheetId;
    }

    removeResponse(responseId) {
        delete this.responses[responseId];
    }

    addResponse(response) {
        let responseId = response.responseId;
        //Calculate question Ids that this response is adding to all other responses
        let toAddToOthers = response.getIncludedQuestionIds().difference(this.includedQuestions);
        toAddToOthers.forEach((questionId) => {
            this.getResponses().forEach((otherResponse) => {
                otherResponse.addAnswer(new Answer(questionId, ""));
            });
        })
        //Calculate question Ids that must be added to this response
        let toAddToThis = this.includedQuestions.difference(response.getIncludedQuestionIds());
        toAddToThis.forEach((questionId) => {
            response.addAnswer(new Answer(questionId, ""));
        })
        this.responses[responseId] = response;
        this.includedQuestions = this.includedQuestions.union(response.getIncludedQuestionIds());
        this.candidateCount++;
        return responseId;
    }

    //Add a new, empty response (for new response button)
    async addEmptyResponse() {
        let newResponseId = generateUniqueId((id) => this.getResponseIds().includes(id));
        let newResponse = new Response(newResponseId, await this.timeService.getActualTime());
        this.includedQuestions.forEach((questionId) => {
            let newAnswer = new Answer(questionId, "");
            newResponse.addAnswer(newAnswer);
        });
        return this.addResponse(newResponse);
    }

    //Add an empty answer to each existing response (for new column button)
    addEmptyAnswer() {
        let questionId = generateUniqueId((potentialId) => this.includedQuestions.has(potentialId));
        this.includedQuestions.add(questionId);
        for (const [responseId, response] of Object.entries(this.responses)) {
            let newQuestionObj = new Answer(questionId, "");
            response.addAnswer(newQuestionObj);
        }
        return questionId;
    }

    setMatching(matching) {
        this.matching = matching;
    }

    getNumberOfResponses() {
        return Object.keys(this.responses).length;
    }

    getNumberOfQuestions() {
        return this.includedQuestions.size;
    }

    getResponses() {
        return Object.values(this.responses);
    }

    getResponseIds() {
        return Object.keys(this.responses);
    }

    getResponse(responseId) {
        return this.responses[responseId];
    }

    toJson() {
        return {
            key: this.dbKey, data: {
                version: this.version,
                label: this.label,
                candidateCount: this.candidateCount,
                sheetId: this.sheetId,
                createdAt: this.createdAt,
                modifiedAt: this.modifiedAt,
                toolkitModifiedAt: this.toolkitModifiedAt,
                matching: this.matching,
                responses: Object.fromEntries(Object.entries(this.responses).map(([k, v]) => [k, v.toJson()])),
                toolkitMapping: this.toolkitMapping
            }
        }
    }
}

class Response extends BaseResponse {
    answerClass = Answer;
    toJson() {
        return {
            timestamp: this.submissionTime,
            answers: this.getAnswers().map((answer) => answer.toJson())
        }
    }

    static fromJson(responseId, { timestamp, answers } = {}) {
        var result = new Response(responseId, timestamp);
        result.answers = answers.map((answerJson) => Answer.fromJson(answerJson));
        return result;
    }
}

class Answer extends BaseAnswer {

    toJson() {
        return {
            answerContent: this.content,
            questionIdentifier: this.questionId
        }
    }

    static fromJson({ answerContent, questionIdentifier } = {}) {
        return new Answer(questionIdentifier, answerContent);
    }
}