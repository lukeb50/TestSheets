class RawSourceResult {
    #headers = [];
    #responses = [];
    #metadata = [];

    addHeader(header) {
        this.#headers.push(header)
    }

    getHeader(questionId) {
        return this.#headers.find((header) => header.questionId === questionId);
    }

    addResponse(response) {
        this.#responses.push(response);
    }

    getResponses() {
        return this.#responses;
    }

    addMetadata(metadata) {
        this.#metadata.push(metadata);
    }

    getResponseIds() {
        return this.#responses.map((response) => response.responseId);
    }


    //Ensures that unused headers are removed and each response has an answer for each question.
    normalizeData() {
        this.#dropUnusedHeaders();
        this.#normalizeIncludedAnswers();
    }

    #dropUnusedHeaders() {
        let usedQuestionIds = this.getAllUsedQuestionIds();
        this.#headers = this.#headers.filter((header) => usedQuestionIds.has(header.questionId));
    }

    #normalizeIncludedAnswers() {
        let includedQuestions = this.getAllUsedQuestionIds();
        this.#responses.forEach((response) => {
            let responseIncludedQuestions = new Set(response.getAnswers().map((answer) => answer.questionId));
            let answersToAdd = includedQuestions.difference(responseIncludedQuestions);
            answersToAdd.forEach((questionId) => {
                response.addAnswer(new RawSourceResponseAnswer(questionId, ""));
            })
        })
    }

    getAllUsedQuestionIds() {
        let includedQuestions = new Set();
        this.#responses.forEach((response) => {
            response.getAnswers().forEach((answer) => {
                includedQuestions.add(answer.questionId);
            })
        })
        return includedQuestions;
    }
}

class RawSourceHeader {
    #questionId;
    #headerContent;
    constructor(questionId, headerContent) {
        this.#questionId = questionId;
        this.#headerContent = headerContent;
    }

    get questionId() {
        return this.#questionId;
    }

    get headerContent() {
        return this.#headerContent;
    }
}

class RawSourceResponse extends BaseResponse {
}

class RawSourceResponseAnswer extends BaseAnswer {

}

class RawSourceMetadata {
    #name;
    #content;
    constructor(name, content) {
        this.#name = name;
        this.#content = content;
    }

    get name() {
        return this.#name;
    }

    get content() {
        return this.#content;
    }
}