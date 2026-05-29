class ToolkitMappingFullInterpreter {
    response;
    constructor(responseObj) {
        this.response = responseObj;
    }

    #getToolkitLoc() {
        return this.response instanceof ResponseContainer ? this.response.getToolkitMapping() : this.response;
    }

    getSkillsList() {
        return Object.keys(this.#getToolkitLoc());
    }

    getNumberOfSkills() {
        return this.getSkillsList().length;
    }

    getSkill(skillName) {
        return this.#getToolkitLoc()[skillName] ? new ToolkitMappingSkillInterpreter(this.#getToolkitLoc()[skillName]) : null;
    }
}

class ToolkitMappingSkillInterpreter {
    data;
    constructor(data) {
        this.data = data ?? [];
    }

    getNumberOfEntries() {
        return this.data.length;
    }

    getEntry(index) {
        return this.data[index] ? new ToolkitMappingSkillEntryInterpreter(this.data[index]) : null;
    }

    getLastEntry() {
        if (this.getNumberOfEntries() === 0) {
            return null;
        }
        return this.getEntry(this.getNumberOfEntries() - 1);
    }

    getAllEntries() {
        return this.data.map((entry) => new ToolkitMappingSkillEntryInterpreter(entry));
    }

    *[Symbol.iterator]() {
        for (const entry of this.data) {
            yield new ToolkitMappingSkillEntryInterpreter(entry);
        }
    }

    forEach(callback) {
        let i = 0;
        for (const interpreter of this) {
            callback(interpreter, i);
            i++;
        }
    }
}

class ToolkitMappingSkillEntryInterpreter {
    data;
    constructor(data) {
        this.data = data;
    }

    getId() {
        return this.data.id;
    }

    getRawCandidateData() {
        return this.data.candidates;
    }

    getCandidateCount() {
        return this.getCandidateIds().length;
    }

    getCandidateIds() {
        return this.data.candidates.flat().map((x) => x.id).filter((x) => x !== null);
    }

    getCandidateResult(candidateId) {
        return this.#getCanadidateResultMapping()[candidateId] ?? null;
    }

    getGroupingTeamData() {
        return this.data.candidates.map((team) => team.map((individualEntry) => individualEntry.id));
    }

    #getCanadidateResultMapping() {
        return Object.fromEntries(Object.values(this.data.candidates.flat()).filter((x) => x.id !== null).map((x) => [x.id, x.result]));
    }
}