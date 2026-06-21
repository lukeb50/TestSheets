class ResponseMatchingStrategy extends BaseMatchingStrategy {
    _mergeScores(headerScore, responseScore) {
        return responseScore;
    }

    _processResponse(_, field, response) {
        if (!field.RegexMatch) {
            //We can only process Regex matches
            return 0;
        }
        let regExp = new RegExp(field.RegexMatch);
        if (regExp.test(response.content)) {
            return 1;
        }
        return 0;
    }
}