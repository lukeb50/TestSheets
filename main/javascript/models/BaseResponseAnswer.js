class BaseResponse {
    responseId;
    answers;
    submissionTime;
    constructor(responseId, submissionTime = -1) {
        this.responseId = responseId;
        this.answers = [];
        this.submissionTime = submissionTime;
    }

    get responseId() {
        return this.responseId;
    }

    addAnswer(answer) {
        this.answers.push(answer);
    }

    getAnswers() {
        return this.answers;
    }

    getAnswer(questionId) {
        return this.answers.find((answer) => answer.questionId === questionId);
    }

    getIncludedQuestionIds() {
        return new Set(this.answers.map((answer) => answer.questionId));
    }

    get submissionTime() {
        return this.submissionTime;
    }

    static fromResponse(response, answerClass) {
        let result = new this(response.responseId, response.submissionTime);
        for (const answer of response.getAnswers()) {
            result.addAnswer(answerClass.fromAnswer(answer));
        }
        return result;
    }
}

class BaseAnswer {
    questionId;
    content;
    constructor(questionId, content) {
        this.questionId = questionId;
        this.content = content;
    }

    get questionId() {
        return this.questionId;
    }

    getContent() {
        return this.content;
    }

    setContent(content) {
        this.content = content;
    }

    static fromAnswer(answer, toType) {
        return new this(answer.questionId, answer.getContent());
    }
}