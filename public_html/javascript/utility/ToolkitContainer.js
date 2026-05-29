class SkillMarkingEntry {
    situationConfiguration;
    situationData;

    teams = [];

    dbKey;
    skillId;
    attachedSheet;

    modifiedAt;
    version = 1;

    saveStatus = SAVE_STATUS.UNSAVED;

    constructor(dbKey, attachedSheetKey, skillId, saveStatus, modifiedAt = Date.now()) {
        this.skillId = skillId;
        this.attachedSheet = attachedSheetKey;
        this.dbKey = dbKey ?? self.crypto.randomUUID();
        this.modifiedAt = modifiedAt;
        this.setSaveStatus(saveStatus);
    }

    setSaveStatus(saveStatus) {
        this.saveStatus = saveStatus;
    }

    addTeamEntry() {
        let newTeam = new TeamEntry(this);
        this.teams.push(newTeam);
        return newTeam;
    }

    toJson() {
        return {
            key: this.dbKey, attachedSheetKey: this.attachedSheet, data: {
                situationConfiguration: this.situationConfiguration,
                situationData: this.situationData,
                teams: this.teams.map((team) => team.toJson()),
                skillId: this.skillId,
                modifiedAt: this.modifiedAt,
                version: this.version
            }
        }
    }

    markModified() {
        this.modifiedAt = Date.now();
    }

    static fromJson({ situationConfiguration, situationData, teams, skillId, modifiedAt, version } = {}, key, attachedSheetKey) {
        let skillObj = new SkillMarkingEntry(key, attachedSheetKey, skillId, modifiedAt);
        skillObj.situationConfiguration = situationConfiguration;
        skillObj.situationData = situationData;
        skillObj.teams = teams.map((team) => TeamEntry.fromJson(team, skillObj));
        skillObj.version = version;
        return skillObj;
    }
}

class TeamEntry {
    situationConfiguration;
    situationData;
    individuals = [];
    markingReference;
    constructor(markingReference) {
        this.markingReference = markingReference;
    }
    addIndividualEntry(responseId) {
        let newIndividual = new IndividualEntry(responseId, this);
        this.individuals.push(newIndividual);
        return newIndividual;
    }

    getIncludedResponseIds() {
        return this.individuals.map((entry) => entry.responseId);
    }

    toJson() {
        return {
            situationConfiguration: this.situationConfiguration,
            situationData: this.situationData,
            individuals: this.individuals.map((individual) => individual.toJson())
        }
    }

    static fromJson({ situationConfiguration, situationData, individuals } = {}, marking) {
        let team = new TeamEntry(marking);
        team.situationConfiguration = situationConfiguration;
        team.situationData = situationData;
        team.individuals = individuals.map((jsonEntry) => IndividualEntry.fromJson(jsonEntry, team));
        return team;
    }
}

class IndividualEntry {
    responseId = null;
    marking;
    commentData = "";
    result = null;
    teamReference;
    constructor(responseId, teamReference) {
        this.responseId = responseId;
        this.teamReference = teamReference;
    }

    toJson() {
        return {
            responseId: this.responseId,
            marking: this.marking,
            commentData: this.commentData,
            result: this.result
        }
    }

    static fromJson({ responseId, marking, commentData, result } = {}, team) {
        let individual = new IndividualEntry(responseId, team);
        individual.marking = marking;
        individual.commentData = commentData;
        individual.result = result;
        return individual;
    }
}