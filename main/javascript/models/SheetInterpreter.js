class SheetInterpreter {
    #sheet;
    #sheetData;
    #fieldData;

    #fullFields;
    #excludedFields;

    constructor(sheetContainer, fieldData, sheetData = null) {
        this.#sheet = sheetContainer;
        this.#sheetData = sheetData ?? getSheetFromIdentifier(sheetContainer.getSheetIdentifier());
        this.#fieldData = fieldData;
    }

    getFieldNameFromQuestionId(questionId) {
        return Object.keys(this.#sheet.matching).find(key => this.#sheet.matching[key] === questionId);
    }

    #generateFieldData() {
        let fields = this.#sheetData.fields;
        this.#excludedFields = [];
        //Dividables
        if (this.#sheetData["DividablesToInclude"]) {
            fields = fields.concat(this.#sheetData.DividablesToInclude);
            this.#sheetData.DividablesToInclude.forEach((divisibleField) => {
                //Remove any field that gets divided into.
                Object.keys(fieldData[divisibleField]['DivisibleFields']).forEach((componentField) => {
                    fields.splice(fields.indexOf(componentField), 1);
                    //this.#excludedFields.push(componentField);
                });
            });
        }
        //Combinables
        if (this.#sheetData["CombinablesToInclude"]) {
            this.#sheetData["CombinablesToInclude"].forEach((combinable) => {
                //Add the component fields
                fields = fields.concat(fieldData[combinable].CombinedFormatting.FieldsToInclude);
                //Remove the actual combinable field
                fields.splice(fields.indexOf(combinable), 1);
                //this.#excludedFields.push(combinable);
            });
        }
        this.#fullFields = fields;
    }

    getExcludedFields() {
        if (!this.#excludedFields) {
            this.#generateFieldData();
        }
        return this.#excludedFields;
    }

    getFullFields() {
        if (!this.#fullFields) {
            this.#generateFieldData();
        }
        return this.#fullFields;
    }
}