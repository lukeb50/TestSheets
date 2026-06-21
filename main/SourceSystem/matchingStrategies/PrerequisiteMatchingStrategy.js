class PrerequisiteMatchingStrategy extends BaseMatchingStrategy {
    prereqFields;
    constructor() {
        super();
        const dateRegex = new RegExp(/^(?<year>\d{2,4})-(?<month>\d{2})-(?<day>\d{2})$/);
        this.prereqFields = [{
            Name: "Date", MatchingFunction: function (val) {
                return dateRegex.test(val.toString().trim());
            }
        }, {
            Name: "Location", MatchingFunction: function (val) {
                return !dateRegex.test(val.toString().trim());
            },
        }, {
            Name: "Name", MatchingFunction: function (val) {
                return false;
            }
        }];
    }

    _mergeScores(headerScore, responseScore) {
        if (headerScore === 1 && responseScore > 0.5) {
            return Number.MAX_SAFE_INTEGER;
        } else {
            return 0;
        }
    }

    _processHeader(sheet, field, header) {
        if (!field['PrereqNumber']) {
            return 0;
        }
        if (!sheet.prerequisites || !sheet.prerequisites.courses) {
            return 0;
        }
        const prerequisites = sheet.prerequisites.courses;
        let headerText = this.stripName(header.headerContent);
        let prereqCourseName = this.stripName(prerequisites[field['PrereqNumber'] - 1]);
        if (headerText.includes(prereqCourseName)) {
            return 1;
        }
    }

    _processResponse(sheet, field, response) {
        if (!field['PrereqNumber']) {
            return 0;
        }
        if (!sheet.prerequisites || !sheet.prerequisites.courses) {
            return 0;
        }
        let prereqData = this.prereqFields.find((data) => data.Name === field['PrereqType']);
        if (prereqData.MatchingFunction(response.content) === true) {
            return 1;
        }
        return 0;
    }
}