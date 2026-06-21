class BaseMatchingStrategy {
    matchQuestion(sheet, field, headerObject, allResponses) {
        let headerScore = this._processHeader(sheet, field, headerObject);
        let responseScore = 0;
        allResponses.forEach(response => {
            responseScore += this._processResponse(sheet, field, response);
        });
        let finalResponseScore = responseScore / allResponses.length;
        return this._mergeScores(headerScore, finalResponseScore);
    }

    _mergeScores(headerScore, responseScore) {
        return headerScore + responseScore;
    }

    _processHeader(sheet, field, header) {
        return 0;
    }

    _processResponse(sheet, field, response) {
        return 0;
    }

    stripName(text) {
        return text.trim().toLowerCase();
    }
}