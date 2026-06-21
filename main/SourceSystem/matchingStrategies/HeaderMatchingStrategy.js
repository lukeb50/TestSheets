class HeaderMatchingStrategy extends BaseMatchingStrategy {
    _mergeScores(headerScore, responseScore) {
        return headerScore;
    }

    _processHeader(_, field, header) {
        let fieldText = this.stripName(field['Display']['English']);
        let headerContent = this.stripName(header.headerContent);
        return headerContent.includes(fieldText) ? 1 : 0;
    }
}