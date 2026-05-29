var sheetData;
var toolkitData;

var sheetContainer;
var currentMarkingToolkit;
var userToolkitSettings;


const overviewSection = document.getElementById("overviewSection");
const markingSection = document.getElementById("markingSection");
const resultSection = document.getElementById("resultSection");

const sections = [overviewSection, markingSection, resultSection];

const overviewSubBar = document.getElementById("overviewSubBar");
const markingSubBar = document.getElementById("markingSubBar");
const resultSubBar = document.getElementById("resultSubBar");

const subBars = [overviewSubBar, markingSubBar, resultSubBar];

const dialogContainer = document.getElementById("dialogContainer");
const situationModificationDialog = document.getElementById("situationModificationDialog");
const settingsDialog = document.getElementById("settingsDialog");
const newEvalComplexDialog = document.getElementById("newEvalComplexDialog");

const app = initFirebase();

firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
        redirectToCreate();
    }
});

var selectedSituation = -1;

const dataManagerInstance = new DataManager(getConnectionManager());
const indexedDbManagerInstance = new IndexedDbManager();

var isFirstSaveFail = true;
onSaveSuccess = (() => {
    setSaveIndicator(currentMarkingToolkit.saveStatus);
    history.replaceState({ key: currentMarkingToolkit.dbKey, page: "marking", saveStatus: currentMarkingToolkit.saveStatus, skillIdentifier: currentMarkingToolkit.skillId }, "");
    isFirstSaveFail = true;
})

onSaveFail = (() => {
    if (isFirstSaveFail) {
        alert("Error saving");
        isFirstSaveFail = false;
    }
    setSaveIndicator(currentMarkingToolkit.saveStatus);
})

onSaveStart = (() => {
    setSaveIndicator(SAVE_STATUS.SAVING);
})

onChange = (() => {
    currentMarkingToolkit.markModified();
})

saveExecuteFn = (async () => {
    await dataManagerInstance.saveToolkitInstance(currentMarkingToolkit, sheetContainer);
})

allowSave = (() => {
    return sheetContainer && currentMarkingToolkit;
});

async function redirectToCreate() {
    await forceSave();
    window.location.href = "create.html"
}

async function redirectToHome() {
    await forceSave();
    window.location.href = "home.html"
}

document.getElementById("signOutButton").onclick = async function () {
    await forceSave();
    logoutUser();
    redirectToCreate();
}

const maximumSituationCount = 10;
const maxIndividualCount = 6
const maxTeamCount = 16;

window.onload = async function () {
    //Load JSON files
    var params = new URLSearchParams(window.location.search);
    if (!params.has("id") || !await awaitUserLoad()) {
        alert("Invalid navigation");
        redirectToHome();
        return;
    }
    var sheetId = params.get("id");
    renderSkillSkeletons();
    resolveAllPromises({
        dataFiles: loadJsonFiles(dataFileNames.sheets, dataFileNames.fields, dataFileNames.toolkit),
        userInfo: dataManagerInstance.getUserInformation(),
        sheetInfoBuilder: dataManagerInstance.getSheetInstance(sheetId)
    }).then((loadResults) => {
        userToolkitSettings = loadResults.userInfo.settings.toolkitSettings;
        sheetData = loadResults.dataFiles[dataFileNames.sheets];
        toolkitData = loadResults.dataFiles[dataFileNames.toolkit];
        sheetContainer = loadResults.sheetInfoBuilder.setFieldData(loadResults.dataFiles[dataFileNames.fields]).setSheetInformation(sheetData).build();
        history.replaceState({ key: null, page: "skillList" }, "");
        document.getElementById("toolkitTitle").textContent = getSheetFromIdentifier(sheetContainer.getSheetIdentifier()).name;
        handleSheetNameInput();
        showSkillsListScreen();
    }).catch((e) => {
        alert("Internal error. Please try again later");
        console.log(e);
    });
};

const sheetNameInput = document.getElementById("sheetNameInput");
function handleSheetNameInput() {
    sheetNameInput.disabled = false;
    sheetNameInput.classList.remove("skeleton");
    sheetNameInput.value = sheetContainer.label;
    sheetNameInput.addEventListener("change", function () {
        let newLabelValue = sheetNameInput.value;
        dataManagerInstance.setSheetLabel(sheetContainer.dbKey, newLabelValue);
        sheetContainer.label = newLabelValue;
    })
}

const skillList = document.getElementById("skillList");
const skillCardTemplate = document.getElementById("skillCardTemplate");
function renderSkillSkeletons() {
    clearChildren(skillList);
    for (let i = 0; i < 3; i++) {
        createSkeleton(skillCardTemplate, skillList);
    }
}

function navigateToSkillsListScreen() {
    history.pushState({ key: null, page: "skillList" }, "");
    showSkillsListScreen();
}

function showSkillsListScreen() {
    showSection(overviewSection)
    var sheetToolkitData = toolkitData.sheets[sheetContainer.getSheetIdentifier()];
    if (!sheetToolkitData) {
        alert("No data found. Please report this issue");
        return;
    }
    clearChildren(skillList);
    var sheetToolkitSkills = sheetToolkitData.skills;
    var sheetToolkitSkillsToShow = Object.fromEntries(Object.entries(sheetToolkitSkills).filter(([key, val]) => val.hidden === undefined || val.hidden === false));
    let categoryName = (Object.entries(sheetData).filter(
        ([cantegoryName, categoryData]) => categoryData.find((sheetEntry) => sheetEntry.identifier === sheetContainer.getSheetIdentifier())
    )).flat()[0];
    for (const skillKey of Object.keys(sheetToolkitSkillsToShow)) {
        //Create card
        let fragment = skillCardTemplate.content.cloneNode(true);
        let cardRoot = fragment.firstElementChild;
        skillList.appendChild(fragment);
        //Set content
        cardRoot.style.setProperty("--color", `var(--${categoryName})`);
        cardRoot.querySelector(".skillCardTitle").textContent = sheetToolkitSkills[skillKey].name;
        const featureList = cardRoot.querySelector(".skillCardList");
        //Flag indicators
        let flagOrderingArray = Object.keys(toolkitData.flagNames);
        //Sort flags by the order they appear in the flag info doc to ensure consistency
        //Filters out any flags that are not in the info doc to restrict internal flags being shown
        let sheetFlags = sheetToolkitSkills[skillKey].featureFlags?.filter((flag) => flagOrderingArray.includes(flag.name)).sort((a, b) => flagOrderingArray.indexOf(a.name) - flagOrderingArray.indexOf(b.name)) ?? [];
        sheetFlags.forEach((flag) => {
            //Go through each flag and display
            let flagName = flag.name;
            let flagText = toolkitData.flagNames[flagName].name;
            if (flagText) {
                let flagElement = createElement("span", featureList, flagText, "");
                flagElement.style.setProperty("--iconColor", toolkitData.flagNames[flagName].color);
                createElement("span", flagElement, toolkitData.flagNames[flagName].icon, "material-symbols-outlined");
            }
        });
        cardRoot.querySelector(".skillCardGoButton").addEventListener("click", async () => {
            try { await loadMostRecentOrNewToolkit(skillKey) } catch (err) {
                console.log(err)
                alert("Unable to open evaluation. Please try again later");
            }
        });
        let toolkitSkillInterpreter = new ToolkitMappingFullInterpreter(sheetContainer).getSkill(skillKey);
        if (toolkitSkillInterpreter && toolkitSkillInterpreter.getNumberOfEntries() > 0) {
            let evalCount = toolkitSkillInterpreter.getNumberOfEntries();
            cardRoot.querySelector(".skillCardGoText").textContent = `${evalCount} Evaluation${evalCount > 1 ? 's' : ""}`;
        } else {
            cardRoot.querySelector(".skillCardGoText").textContent = "No Evaluations";
        }
    }
}

const candidateSelectChannel = new InternalMessageChannel();
const perSituationMarkingChannel = new InternalMessageChannel();
const markingChangeChannel = new InternalMessageChannel();

const skillTitle = document.getElementById("skillTitle");

function navigateToMarkingSkillScreen(currentSkillEntry) {
    history.pushState({ key: currentSkillEntry.dbKey, page: "marking", saveStatus: currentSkillEntry.saveStatus, skillIdentifier: currentSkillEntry.skillId }, "");
    showMarkingSkillScreen(currentSkillEntry);
}

async function showMarkingSkillScreen(currentSkillEntry) {
    currentMarkingToolkit = currentSkillEntry;
    let skillKey = currentMarkingToolkit.skillId;
    resetMarkingScreen();
    showSection(markingSection);
    setSaveIndicator(currentSkillEntry.saveStatus);

    //get skill data
    const sheetToolkitData = toolkitData.sheets[sheetContainer.getSheetIdentifier()].skills[skillKey];
    skillTitle.textContent = sheetToolkitData.name;
    //pull flags
    let jsonFeatureFlags = sheetToolkitData.featureFlags ?? [];
    var sheetFlags = {};
    jsonFeatureFlags.forEach((flagEntry) => {
        sheetFlags[flagEntry.name] = flagEntry;
    });
    flagConfigs = {};
    flagConfigs['sheetId'] = sheetContainer.getSheetIdentifier();
    flagConfigs['skillId'] = skillKey;
    //Apply flags
    if (sheetFlags['situationDesigner']) {
        flagConfigs['situationDesigner'] = true;
        let situationFlag = sheetFlags['situationDesigner'];
        //Settings
        //Ensures that there cannot be more situations than the server allows, with a fallback to the maximum if no value defined
        flagConfigs['maxSituations'] = Math.min(situationFlag["maxSituations"] ?? maximumSituationCount, maximumSituationCount);
        //Global situations
        let isGlobalSituations = situationFlag["globalSituations"] ? await resolveConfigValue(situationFlag["globalSituations"]) : false;
        globalSituationDesigner.style.display = isGlobalSituations ? "flex" : "none";
        flagConfigs['globalSituations'] = isGlobalSituations;
        flagConfigs['individualSituations'] = !isGlobalSituations;
        //per-situation marking
        let isPerSituationMarking = situationFlag["perSituationMarking"] ? await resolveConfigValue(situationFlag["perSituationMarking"]) : false;
        perItemMarkingHolder.style.display = isPerSituationMarking ? "flex" : "none";
        flagConfigs['perSituationMarking'] = isPerSituationMarking;
        selectedSituation = isPerSituationMarking ? 0 : -1;
        //Default number of situations
        let defaultSitCount = situationFlag["defaultSituationCount"] ? await resolveConfigValue(situationFlag["defaultSituationCount"]) : 1;
        flagConfigs['defaultSituationCount'] = defaultSitCount;
    }
    if (sheetFlags['team']) {
        let flag = sheetFlags['team'];
        //Math.min against the server restriction so that a misprogrammed value will not cause saving issues.
        flagConfigs['maxTeamSize'] = Math.min(flag.maxSize, maxIndividualCount);
        flagConfigs['maxTeamCount'] = Math.min(flag.maxCount, maxTeamCount);
    }
    if (sheetFlags['individual']) {
        //Math.min against the server restriction so that a misprogrammed value will not cause saving issues.
        let flag = sheetFlags['individual'];
        flagConfigs['maxTeamSize'] = 1;
        flagConfigs['maxTeamCount'] = Math.min(flag.maxCount, maxTeamCount);
    }
    //Situation Designer
    if (flagConfigs['situationDesigner'] && flagConfigs['globalSituations']) {
        //create the global situation config
        createSituationContainer(globalSituationDesigner, currentSkillEntry, sheetToolkitData, flagConfigs);
        //If this is a new creation, set the situation configuration
        if (!currentSkillEntry.situationConfiguration) {
            currentSkillEntry.situationConfiguration = getUserDefaultSituationConfigurationFile(flagConfigs);
        }
    }
    //render main table
    //New team button
    let maxTeamsCount = flagConfigs['maxTeamCount'] ?? 3;//If not defined, assume a default value
    let newTeamButton = createElement("button", markingHolder, "+");
    newTeamButton.id = "newTeamButton";
    newTeamButton.addEventListener("click", () => {
        let newTeamEntry = currentSkillEntry.addTeamEntry();
        if (flagConfigs['individualSituations']) {
            newTeamEntry.situationConfiguration = getUserDefaultSituationConfigurationFile(flagConfigs);
        }
        if (currentSkillEntry.teams.length >= maxTeamsCount) {
            newTeamButton.style.display = "none";
        }
        if (determineIfPerSituationMarking(flagConfigs)) {
            updatePerSituationMarkingButtons(currentSkillEntry, flagConfigs);
        }
        newTeamButton.before(createTeamContainer(newTeamEntry, flagConfigs['individualSituations'] ?? false, flagConfigs, sheetToolkitData));
        markChange();
    });
    if (currentSkillEntry.teams.length >= maxTeamsCount) {
        newTeamButton.style.display = "none";
    }
    //Render existing teams
    currentSkillEntry.teams.forEach((team) => {
        newTeamButton.before(createTeamContainer(team, flagConfigs['individualSituations'] ?? false, flagConfigs, sheetToolkitData));
    })
    if (flagConfigs['situationDesigner']) {
        updatePerSituationMarkingButtons(currentSkillEntry, flagConfigs);//Configures the per-situation buttons & UI
        markingChangeChannel.notify(-1);//Forces all situation selectors to disable themselves if marking exists for their situation
    }
}

function createTeamContainer(teamData, showSituationDesigner, featureFlagConfigs, sheetToolkitData) {
    //Setup
    let teamMarkingDiv = createElement("div", null, null, "teamMarking");
    if (showSituationDesigner) {
        let situationDesignerDiv = createSituationContainer(null, teamData, sheetToolkitData, featureFlagConfigs);
        teamMarkingDiv.appendChild(situationDesignerDiv);
    }
    let individualsHolder = createElement("div", teamMarkingDiv, null, "individualMarkingHolder");
    //Create a first entry if currently empty
    if (teamData.individuals.length === 0) {
        teamData.addIndividualEntry(null);
    }
    //New Individual Button
    let newIndividualButtonHolder = createElement("div", individualsHolder, null, "newIndividualButtonHolder");
    let newIndividualButton = createElement("button", newIndividualButtonHolder, "+", "newIndividualButton");
    if (teamData.individuals.length >= featureFlagConfigs['maxTeamSize']) {
        newIndividualButtonHolder.style.display = "none";
    }
    newIndividualButton.addEventListener("click", () => {
        let newIndividual = teamData.addIndividualEntry(null);
        addMarkingData(newIndividual, flagConfigs);
        newIndividualButtonHolder.before(createIndividualContainer(newIndividual, sheetToolkitData, featureFlagConfigs));
        if (teamData.individuals.length >= featureFlagConfigs['maxTeamSize']) {
            newIndividualButtonHolder.style.display = "none";
        }
        markChange();
    })
    //Render
    teamData.individuals.forEach((individual) => {
        addMarkingData(individual, flagConfigs);
        newIndividualButtonHolder.before(createIndividualContainer(individual, sheetToolkitData, featureFlagConfigs));
    });
    return teamMarkingDiv;
}

function addMarkingData(individualEntry, flagConfigs) {
    if (!individualEntry.marking) {
        if (determineIfPerSituationMarking(flagConfigs)) {
            let configuredEntry = flagConfigs['globalSituations'] ? individualEntry.teamReference.markingReference : individualEntry.teamReference;
            let situationData = configuredEntry.situationData;
            individualEntry.marking = Array.from({ length: situationData.length }, () => ({}));
        } else {
            individualEntry.marking = {};
        }
    }
}

function createIndividualContainer(individualEntry, sheetToolkitData, flagConfigs) {
    let individualDiv = createElement("div", null, null, "individualMarking");
    let candidateNameSelectSpan = createElement("span", individualDiv, "", "nameSelectSpan");
    let candidateNameSelect = createElement("select", candidateNameSelectSpan);
    let candidateDeleteButton = createElement("button", candidateNameSelectSpan, "delete", "material-symbols-outlined nameDeleteButton");
    candidateDeleteButton.onclick = function () {
        if (!confirm("Delete this entry?")) {
            return;
        }
        let team = individualEntry.teamReference;
        //splice the individual out
        team.individuals.splice(team.individuals.indexOf(individualEntry), 1);
        let teamContainer = individualDiv.parentElement.parentElement;
        if (team.individuals.length === 0) {
            //No more individuals, delete the team
            let marking = team.markingReference;
            marking.teams.splice(marking.teams.indexOf(individualEntry), 1);
            teamContainer.remove();
            //Re-show button to create a new team
            document.getElementById("newTeamButton").style.display = "block";
        }
        //Team UI Updates
        teamContainer.querySelector(".newIndividualButtonHolder").style.display = "flex";
        individualDiv.remove();
        //Re-update all situation selectors in case this candidate was the only one keeping a select disabled with marking
        markingChangeChannel.notify(-1);
        markChange();

    }
    //Create default option
    let defaultSelectOpt = createElement("option", candidateNameSelect, "Select a Candidate");
    defaultSelectOpt.value = "";
    defaultSelectOpt.disabled = true;
    defaultSelectOpt.hidden = true;
    //Create list
    let nameQuestionId = sheetContainer.matching['Name'];
    if (nameQuestionId) {
        let allUsedIds = individualEntry.teamReference.markingReference.teams.reduce((acc, team) => acc.concat(team.getIncludedResponseIds()), []);
        for ([responseId, response] of Object.entries(sheetContainer.getResponses())) {
            let opt = createElement("option", candidateNameSelect, response.getAnswer(nameQuestionId).answerContent);
            opt.value = responseId;
            //Used by a team on the screen and not used by this entry
            if (allUsedIds.includes(responseId) && responseId !== individualEntry.responseId) {
                opt.disabled = true;
            }
        }
        candidateNameSelect.value = individualEntry.responseId ?? "";
        candidateNameSelect.addEventListener("change", () => {
            candidateSelectChannel.notify({ oldValue: individualEntry.responseId, newValue: candidateNameSelect.value })
            individualEntry.responseId = candidateNameSelect.value;
            markChange();
        });
        candidateSelectChannel.addListeningFunction((data) => {
            //Don't activate if this individual triggered the change
            if (data.newValue === candidateNameSelect.value) {
                return;
            }
            //Safety if old value was empty
            if (data.oldValue) {
                candidateNameSelect.querySelector(`option[value="${data.oldValue}"]`).disabled = false;
            }
            candidateNameSelect.querySelector(`option[value="${data.newValue}"]`).disabled = true;
        });
    } else {
        candidateNameSelect.disabled = true;
    }
    //Must-sees
    let mustSeeDiv = createMustSeeList(sheetToolkitData.mustSees, individualEntry, flagConfigs, sheetToolkitData);
    individualDiv.appendChild(mustSeeDiv);
    //Notes section
    let commentSection = createElement("textarea", individualDiv);
    commentSection.placeholder = "Notes";
    commentSection.value = individualEntry.commentData;
    commentSection.addEventListener("change", () => {
        individualEntry.commentData = commentSection.value;
        markChange();
    });
    //Pass-fail section
    let resultSection = createElement("div", individualDiv, null, "resultSection");
    //pass section
    let passCheckbox = createElement("input", null, null, "markingCheckbox");
    passCheckbox.type = "checkbox";
    let passLabel = createElement("label", resultSection, null, "pass");
    passLabel.appendChild(passCheckbox);
    passLabel.appendChild(document.createTextNode("Pass"));
    //fail section
    let failCheckbox = createElement("input", null, null, "markingCheckbox negativeMarking");
    failCheckbox.type = "checkbox";
    let failLabel = createElement("label", resultSection, null, "fail");
    failLabel.appendChild(failCheckbox);
    failLabel.appendChild(document.createTextNode("Fail"));
    //Load value
    updateResultDisplay(individualEntry.result);
    //Checkbox listeners
    passCheckbox.addEventListener("change", () => {
        if (passCheckbox.checked) {
            individualEntry.result = true;
            updateResultDisplay(true);
        } else {
            individualEntry.result = null;
            updateResultDisplay(null);
        }
        markChange();
    })
    failCheckbox.addEventListener("change", () => {
        if (failCheckbox.checked) {
            individualEntry.result = false;
            updateResultDisplay(false);
        } else {
            individualEntry.result = null;
            updateResultDisplay(null);
        }
        markChange();
    });

    function updateResultDisplay(result) {
        //Clear styles
        failLabel.classList.remove("active");
        passLabel.classList.remove("active");
        failCheckbox.checked = false;
        passCheckbox.checked = false;
        if (result === true) {//Pass
            passCheckbox.checked = true;
            passLabel.classList.add("active");
        } else if (result === false) {//Fail
            failCheckbox.checked = true;
            failLabel.classList.add("active");
        }
    }
    resultSection.addEventListener("resultChange", (data) => {
        updateResultDisplay(data.detail);
        markChange();
    });
    return individualDiv;
}

const situationCountInput = document.getElementById("situationCountInput");
const situationMenuSlotHolder = document.getElementById("situationMenuSlotHolder");

const situationCountDownButton = document.getElementById("situationCountDownButton");
const situationCountUpButton = document.getElementById("situationCountUpButton");

const situationConfigApplyButton = document.getElementById("situationConfigApplyButton");
const situationConfigDefaultCheckbox = document.getElementById("situationConfigDefaultCheckbox");
function showSituationConfigMenu(configuredEntry, sheetToolkitData, flagConfigs, situationContainerForEvent) {
    var configObj = JSON.parse(JSON.stringify(getSituationConfigurationFile(configuredEntry, flagConfigs)));
    //Render the config
    situationConfigDefaultCheckbox.checked = false;
    situationCountInput.value = configObj.excludedLists.length;
    situationCountInput.max = flagConfigs['maxSituations'];
    situationCountDownButton.disabled = configObj.excludedLists.length === 1;
    situationCountUpButton.disabled = configObj.excludedLists.length === flagConfigs['maxSituations'];
    //UI
    clearChildren(situationMenuSlotHolder);
    configObj.excludedLists.forEach((excludeList, i) => {
        createSituationSpan(excludeList, i);
    });

    function createSituationSpan(excludeList, i) {
        let holderSpan = createElement("span", situationMenuSlotHolder, null, "situationSpan");
        holderSpan.setAttribute("data-situation", i);
        createElement("p", holderSpan, `Situation ${i + 1}`);
        let sitSelector = createElement("multi-select", holderSpan, "", "");
        sitSelector.setAttribute("data-situation", i);
        sitSelector.attachScroll(situationMenuSlotHolder.parentElement.parentElement);
        fillMultiSelect(sitSelector, excludeList, sheetToolkitData);
    }

    function fillMultiSelect(selector, excludeList, sheetToolkitData) {
        let configData = [];
        sheetToolkitData.featureFlags.find((flag) => flag.name === "situationDesigner").situationLists?.forEach((list) => {
            let categoryObj = { name: list.categoryName, content: [] };
            list.categoryLists.forEach((catList) => {
                if (isIncludeListItem(catList)) {
                    let currentList = getListReference(catList.list, sheetToolkitData);
                    categoryObj.content.push({ name: currentList.name, value: catList.list });
                }
            })
            configData.push(categoryObj);
        });
        selector.setOptions(configData);
        selector.setNegativeValue(excludeList);
    }

    situationCountDownButton.onclick = function () {
        if (situationCountInput.value <= situationCountInput.min) {
            return;
        }
        configObj.excludedLists.pop();
        situationMenuSlotHolder.querySelector(`span[data-situation="${situationCountInput.value - 1}"]`).remove();
        situationCountInput.value--;
        if (Number(situationCountInput.value) === 1) {
            situationCountDownButton.disabled = true;
        }
        situationCountUpButton.disabled = false;
    };

    situationCountUpButton.onclick = function () {
        if (situationCountInput.value >= situationCountInput.max) {
            return;
        }
        configObj.excludedLists.push([]);
        situationCountInput.value++;
        if (Number(situationCountInput.value) === Number(situationCountInput.max)) {
            situationCountUpButton.disabled = true;
        }
        situationCountDownButton.disabled = false;
        createSituationSpan(configObj.excludedLists[configObj.excludedLists.length - 1], configObj.excludedLists.length - 1);
    };

    situationConfigApplyButton.onclick = function () {
        //Hide menu
        dialogContainer.style.display = "none";
        //calculate new config
        situationMenuSlotHolder.querySelectorAll(`multi-select`).forEach((selector) => {
            var selectorI = parseInt(selector.getAttribute("data-situation"));
            configObj.excludedLists[selectorI] = selector.getNegativeValue();
        });
        if (situationConfigDefaultCheckbox.checked) {
            //Save as default
            if (!userToolkitSettings.situationConfigs) {
                userToolkitSettings.situationConfigs = {};
            }
            let settingConfigKey = `${flagConfigs['sheetId']}/${flagConfigs["skillId"]}`
            userToolkitSettings.situationConfigs[settingConfigKey] = configObj;
            dataManagerInstance.updateUserInformation(["settings", "toolkitSettings"], userToolkitSettings);
        }
        //Apply to toolkit
        configuredEntry.situationConfiguration = configObj;
        //Update each user per-situation marking array if applicable
        if (determineIfPerSituationMarking(flagConfigs)) {
            if (configuredEntry instanceof TeamEntry) {
                adjustMarkingArrayForTeam(configuredEntry, configObj.excludedLists.length);
            } else {
                configuredEntry.teams.forEach((team) => {
                    adjustMarkingArrayForTeam(team, configObj.excludedLists.length);
                })
            }
            function adjustMarkingArrayForTeam(team, newSize) {
                team.individuals.forEach((individual) => {
                    //Equals to is explicitly left out
                    if (individual.marking.length > newSize) {
                        let toRemove = individual.marking.length - newSize;
                        individual.marking.splice(newSize, toRemove);
                    } else if ((individual.marking.length < newSize)) {
                        let toAdd = newSize - individual.marking.length;
                        for (let i = 0; i < toAdd; i++) {
                            individual.marking.push({});
                        }
                    }
                });
            }
        }
        //Apply to per-situation marking buttons
        let markingEntry = configuredEntry instanceof TeamEntry ? configuredEntry.markingReference : configuredEntry;
        updatePerSituationMarkingButtons(markingEntry, flagConfigs);
        //Propagate back to select dropdowns
        situationContainerForEvent.dispatchEvent(new CustomEvent("situationUpdate", { detail: configObj }));
        markChange();
    }
}

function getSituationConfigurationFile(configuredEntry, flagConfigs) {
    var configObj;
    //Decide which config to pull
    if (configuredEntry?.situationConfiguration) {
        //There is a configuration for this marking/team
        configObj = configuredEntry.situationConfiguration;
    } else {
        return getUserDefaultSituationConfigurationFile(flagConfigs);
    }
    return configObj;
}

function getUserDefaultSituationConfigurationFile(flagConfigs) {
    var configObj;
    let settingConfigKey = `${flagConfigs['sheetId']}/${flagConfigs["skillId"]}`
    if (userToolkitSettings.situationConfigs && userToolkitSettings.situationConfigs[settingConfigKey]) {
        //The user has a default configuation
        configObj = userToolkitSettings.situationConfigs[settingConfigKey];
    } else {
        //The user has not configured either, create a default config to show
        let sitCount = flagConfigs['defaultSituationCount'];
        configObj = { excludedLists: Array.from({ length: sitCount }, () => []) };
    }
    return configObj;
}

document.querySelectorAll("button.cancelAction").forEach((btn) => {
    btn.addEventListener("click", () => {
        dialogContainer.style.display = "none";
    })
})

function createSituationContainer(appendTo, attachedToolkitEntry, sheetToolkitData, flagConfigs) {
    let situationConfig = getSituationConfigurationFile(attachedToolkitEntry, flagConfigs);
    if (!attachedToolkitEntry.situationData) {
        attachedToolkitEntry.situationData = Array(situationConfig.excludedLists.length).fill("");
    }
    let sitDiv = appendTo ?? createElement("div", null, null, "situationDesigner");
    //Main Holder
    let mainSection = createElement("div", sitDiv, null, "situationDesignerSelectionHolder");
    sitDiv.style.setProperty("--situation-count", situationConfig.excludedLists.length);
    sitDiv.style.setProperty("--sit", selectedSituation);
    var selects = [];
    situationConfig.excludedLists.forEach((excludeList, i) => {
        let createdSelect = createIndividualSituation(mainSection, i, sheetToolkitData, excludeList);
        if (attachedToolkitEntry.situationData && attachedToolkitEntry.situationData[i]) {
            createdSelect.value = attachedToolkitEntry.situationData[i];
        }
        selects.push(createdSelect);
        bindSelectChange(createdSelect, i);
    })
    //Bottom Bar
    let bottomBar = createElement("div", sitDiv, null, "situationDesignerBottomHolder");
    let configLabel = createElement("label", bottomBar, "Configure", null);
    let configBtn = createElement("button", configLabel, "manufacturing", "material-symbols-outlined configureSituationsButton");
    configBtn.addEventListener("click", () => {
        hideAllChildren(dialogContainer);
        dialogContainer.style.display = "block";
        situationModificationDialog.style.display = "flex";
        showSituationConfigMenu(attachedToolkitEntry, sheetToolkitData, flagConfigs, mainSection);
    })
    markingChangeChannel.addListeningFunction((individualEntry) => {
        let isLocalTeamChange = (attachedToolkitEntry instanceof TeamEntry) ? attachedToolkitEntry.individuals.includes(individualEntry) : false;
        if (!flagConfigs['globalSituations'] && !isLocalTeamChange) {//Check that this select should respond to the general event
            if (individualEntry !== -1) {//Not a global signal on load
                return;
            }
        }
        selects.forEach((select, i) => {//loop each select and set disabled status
            let toDisable = !determineIfNoMarking(i);
            select.disabled = toDisable;
            select.parentElement.parentElement.querySelector("button.regenButton").disabled = toDisable;
        })

        function determineIfNoMarking(selectedSit) {
            var isEmpty = true;
            if (attachedToolkitEntry instanceof TeamEntry) {
                for (const individual of attachedToolkitEntry.individuals) {
                    let markingLocation = determineIfPerSituationMarking(flagConfigs) ? individual.marking[selectedSit] : individual.marking;
                    isEmpty = !isEmpty ? false : Object.keys(markingLocation).length === 0;
                    if (!isEmpty) {
                        return;
                    }
                };
            } else {
                for (const team of attachedToolkitEntry.teams) {
                    for (const individual of team.individuals) {
                        let markingLocation = determineIfPerSituationMarking(flagConfigs) ? individual.marking[selectedSit] : individual.marking;
                        isEmpty = !isEmpty ? false : Object.keys(markingLocation).length === 0;
                        if (!isEmpty) {
                            return;
                        }
                    };
                }
            }
            return isEmpty;
        }
    });
    //Listen for updates to the situation configuration
    mainSection.addEventListener("situationUpdate", (data) => {
        //Remove any old values that have been trimmed (i.e. user went from 4 to 3 situations)
        let oldValues = selects.map((select) => select.value);
        let newConfigData = data.detail;
        oldValues.splice(newConfigData.excludedLists.length);
        //reset container
        clearChildren(mainSection);
        sitDiv.style.setProperty("--situation-count", newConfigData.excludedLists.length);
        //render new selects
        selects = [];
        newConfigData.excludedLists.forEach((excludeList, i) => {
            //create
            let createdSelect = createIndividualSituation(mainSection, i, sheetToolkitData, excludeList);
            bindSelectChange(createdSelect, i);
            //If the old value still exists as an option in the new list, select it.
            if (Array.from(createdSelect.options).some((optEl) => optEl.value === oldValues[i])) {
                createdSelect.value = oldValues[i];
            }
            selects.push(createdSelect);
        });
        //Set property
    })
    //Finish
    return sitDiv;
    function bindSelectChange(select, index) {
        select.addEventListener("change", processChange);
        //Bind function
        function processChange(e) {
            if (e) {
                //processChange is called when a toolkit is created via the if statement. When that occurs, an event object will not be passed
                //We only note that the user made a saveable change if it was user-triggered (detected via an event object)
                markChange();
            }
            attachedToolkitEntry.situationData[index] = select.value;
        }
        //If there is no record of a value in the toolkit, update it on bind
        if (attachedToolkitEntry.situationData[index] === "") {
            processChange();
        }
    }
}

function createIndividualSituation(appendTo, i, sheetToolkitData, exclusionList) {
    var mainSpan = createElement("span", appendTo, "", "situationResultSpan");
    //Description
    var descSpan = createElement("span", mainSpan, "", "situationDescriptionSpan");
    createElement("p", descSpan, `Situation ${i + 1}`, "longSituationTitle");
    createElement("p", descSpan, `${i + 1}`, "shortSituationTitle");
    //Reroll button
    let regenButton = createElement("button", descSpan, "replay", "material-symbols-outlined regenButton");
    regenButton.title = "Re-Generate";
    //select
    let selectSpan = createElement("span", mainSpan, "", "selectSpanner");
    let select = createElement("select", selectSpan, "");
    populateSituationSelect(select, sheetToolkitData);
    //reroll button handler
    function roll() {
        let options = select.options;
        let randomIndex = -1;
        if (options.length <= 1) {
            return;
        }
        while (randomIndex === -1 || randomIndex === options.selectedIndex) {
            randomIndex = genIndex();
        }
        select.value = options[randomIndex].value;
        select.dispatchEvent(new Event("change"));
        function genIndex() {
            return Math.floor(Math.random() * options.length);
        }
    };
    regenButton.addEventListener("click", roll);
    roll();
    return select;
    function populateSituationSelect(selectObj, sheetToolkitData) {
        const situationLists = sheetToolkitData.featureFlags.find((flag) => flag.name === "situationDesigner").situationLists;
        situationLists.forEach((category) => {
            //The category has at least one list to be displayed
            if (category.categoryLists.some((listEntry) => { return isIncludeListItem(listEntry) && !exclusionList.includes(listEntry.list) })) {
                let optGroup = createElement("optgroup", selectObj);
                optGroup.label = category.categoryName;
                category.categoryLists.forEach((listEntry) => {
                    //Check that this list is to be shown
                    if (isIncludeListItem(listEntry) && !exclusionList.includes(listEntry.list)) {
                        //Go through the list
                        let listInfo = getListReference(listEntry.list, sheetToolkitData);
                        if (!listInfo || !listInfo.values) {
                            alert(`Internal error, please report this issue - SITLIST ${listEntry.list}`);
                            return;
                        }
                        //Create an entry for each entry in the list
                        listInfo.values.forEach((listLineItem) => {
                            if (listLineItem.skill) {
                                //Could be sub-situations
                                let skillRef = decodeSkillReference(listLineItem.skill);
                                if (!skillRef) {
                                    alert(`Internal error, please report this isuse -SITLISTSKILL ${listLineItem.skill}`);
                                    return;
                                }
                                //Check if sub-situations present
                                if (skillRef.subSituations) {
                                    skillRef.subSituations.forEach((subSituation) => {
                                        //Check if the list restricts certain sub-situations
                                        if (listLineItem.subSituations && !listLineItem.subSituations.includes(subSituation.id)) {
                                            return;
                                        }
                                        let opt = createElement("option", optGroup, "", null);
                                        opt.value = opt.value = `${listEntry.list}/${listLineItem.id}/${subSituation.id}`;;
                                        opt.label = subSituation.text;
                                    });
                                } else {
                                    //No sub-situations
                                    let opt = createElement("option", optGroup, "", null);
                                    opt.value = opt.value = `${listEntry.list}/${listLineItem.id}`;;
                                    opt.label = listLineItem.text;
                                }
                            } else {
                                //No skill ref present, this item is directly from the list
                                let opt = createElement("option", optGroup, "", null);
                                opt.value = `${listEntry.list}/${listLineItem.id}`;
                                opt.label = listLineItem.text;
                            }
                        });
                    }
                })
            }
        });
    }
}

const perItemMarkingHolder = document.getElementById("perItemMarkingHolder");
const perItemMarkingList = document.getElementById("perItemMarkingDiv");

function updatePerSituationMarkingButtons(SkillMarkingEntryObj, flagConfigs) {
    if (!determineIfPerSituationMarking(flagConfigs)) {
        return;
    }
    //Determine how many situations exist across all teams
    var situationCount = 0;
    if (flagConfigs['globalSituations']) {
        situationCount = getSituationConfigurationFile(SkillMarkingEntryObj, flagConfigs).excludedLists.length;
    } else {
        let teamSituationLengths = SkillMarkingEntryObj.teams.map((team) => getSituationConfigurationFile(team, flagConfigs).excludedLists.length);
        situationCount = Math.max(...teamSituationLengths);
    }
    //Record the currently selected situation
    selectedSituation = Number(perItemMarkingList.querySelector(".selected")?.getAttribute("data-situation") ?? 0);
    if (selectedSituation > situationCount - 1) {
        selectedSituation = 0;
    }
    //Re-create the buttons
    clearChildren(perItemMarkingList);
    for (let i = 0; i < situationCount; i++) {
        let btn = createElement("button", perItemMarkingList, `Sit ${i + 1}`, i === selectedSituation ? "selected" : "");
        btn.setAttribute("data-situation", i);
        //Handle clicks
        btn.addEventListener("click", () => {
            selectedSituation = i;
            //clear selection from other button
            perItemMarkingList.querySelector(".selected").classList.remove("selected");
            btn.classList.add("selected");
            perSituationMarkingChannel.notify(selectedSituation);
            //Update situation designers
            updateSituationDesignerHighlight();
        });
    }
    updateSituationDesignerHighlight();
    //Notify must-see handlers
    perSituationMarkingChannel.notify(selectedSituation);

    function updateSituationDesignerHighlight() {
        document.querySelectorAll("div.situationDesigner").forEach((designer) => {
            designer.style.setProperty("--sit", selectedSituation);
        })
    }
}

function getListReference(listName, sheetToolkitData) {
    //Check global lists first
    if (toolkitData.situationLists[listName]) {
        return toolkitData.situationLists[listName];
    }
    //Check sheet lists
    let sheetData = toolkitData.sheets[sheetContainer.getSheetIdentifier()];
    if (sheetData.situationLists && sheetData.situationLists[listName]) {
        return sheetData.situationLists[listName];
    }
    //check local skill lists
    if (sheetToolkitData.situationLists && sheetToolkitData.situationLists[listName]) {
        return sheetToolkitData.situationLists[listName];
    }
    //List does not exist
    return null;
}

//Expects a string in the list/skill format
//Returns the skill in the course/skill format
function getSkillFromListReference(refString, sheetToolkitData) {
    let parts = refString.split("/", 2);
    let listName = parts[0];
    let skillName = parts[1];
    let list = getListReference(listName, sheetToolkitData);
    if (!list) {
        return null;
    }
    let skillKey = list.values.find((entry) => entry.id === skillName)?.skill;
    return skillKey;
}

//Expects a string in the list/skill format
//Returns the skill
function decodeListSkillReference(refString, sheetToolkitData) {
    let skillKey = getSkillFromListReference(refString, sheetToolkitData);
    if (!skillKey) {
        return null;
    }
    return decodeSkillReference(skillKey);
}

function isIncludeListItem(listEntry) {
    if (!listEntry['conditionName']) {
        //No conditions set, include
        return true;
    }
    let userSetValue = resolveConfigValue(listEntry.conditionName);
    let conditionValue = listEntry.conditionValue;
    //Resolve any operators
    switch (listEntry.conditionOperator) {
        case "equalTo":
            return userSetValue === conditionValue;
        default:
            return userSetValue === conditionValue;
    }
}

//Expects a string in the 'course/skill' format
//Returns the skill
function decodeSkillReference(referenceString) {
    let parts = referenceString.split("/", 2);
    let courseName = parts[0];
    let skillName = parts[1];
    if (!toolkitData.sheets[courseName]) {
        return null;
    }
    if (!toolkitData.sheets[courseName]?.skills[skillName]) {
        return null;
    }
    return toolkitData.sheets[courseName]?.skills[skillName];
}


var isComplexInput = true;
function createMustSeeList(mustSeeData, individualEntry, flagConfigs, sheetToolkitData) {
    let mainDiv = createElement("div", null, "", "individualMustSeeHolder scrollbar");
    if (!mustSeeData) {
        return mainDiv;
    }
    mustSeeData.forEach((mustSee) => {
        let checkboxSpan = createListItem(mustSee, mustSee.id, individualEntry, (checkbox) => {
            let resultSec = mainDiv.parentElement.querySelector(".resultSection");
            let markingLocation = determineIfPerSituationMarking(flagConfigs) ? individualEntry.marking[selectedSituation] : individualEntry.marking;
            //Single-action result changes
            if (checkbox.value === false) {
                //Candidate failed an item
                individualEntry.result = false;
                resultSec.dispatchEvent(new CustomEvent("resultChange", { detail: false }));
            }
            if (checkbox.value === null || checkbox.value === true) {
                //Clear any expansion must-sees
                var fromDesignerSituations = determineIncludedSituationSkills(mustSee).filter((el) => el !== null);
                let combinedSkillsToShow = (mustSee.mustSees ?? []).concat(fromDesignerSituations);
                //Find all must-sees in the marking that are false(negative marking) and are inside the expansion list
                let toRemove = Object.entries(markingLocation).filter((currentEntry) => isIncluded(currentEntry[0]) && currentEntry[1] === false).map((doubleEntry) => doubleEntry[0]);
                toRemove.forEach((key) => {
                    delete markingLocation[key];
                });
                function isIncluded(mustSeeStr) {
                    return combinedSkillsToShow.some((skillStr) => mustSeeStr.startsWith(skillStr));
                }
            }
            //Get an array of all the IDs of top-level must-sees (not expansion)
            let topLevelMustSeeIds = Object.values(mustSeeData).map((mustSeeEntry) => mustSeeEntry.id);
            let totalTopLevelMustSees = topLevelMustSeeIds.length * (determineIfPerSituationMarking(flagConfigs) ? individualEntry.marking.length : 1)
            //Get an flattened array of all marking the user has done at the top-level (values only, keys are dropped)
            let topLevelDecisions = determineIfPerSituationMarking(flagConfigs) ?
                individualEntry.marking.map((situationMarking) => extractDecisions(situationMarking)).flat() :
                extractDecisions(markingLocation).flat();

            function extractDecisions(markingLoc) {//Convert to entries, filter the entries, re-make into k-v object, extract the values
                return Object.values(Object.fromEntries(Object.entries(markingLoc).filter(([key, val]) => topLevelMustSeeIds.includes(key))))
            }
            //calculate totals
            var totalFailureCount = topLevelDecisions.filter((val) => val === false).length;
            var totalPassCount = topLevelDecisions.filter((val) => val === true).length;
            //Composite result changes
            if (individualEntry.result === false && totalFailureCount === 0) {
                //Undoing the only failed item - clear the fail
                individualEntry.result = null;
                resultSec.dispatchEvent(new CustomEvent("resultChange", { detail: null }));
            }
            if (checkbox.value === null && totalPassCount === totalTopLevelMustSees - 1 && totalFailureCount === 0) {
                //Undoing a pass when everything else was passed & result was pass - clear the pass
                individualEntry.result = null;
                resultSec.dispatchEvent(new CustomEvent("resultChange", { detail: null }));
            }
            if (totalPassCount === totalTopLevelMustSees && totalFailureCount === 0) {
                //Checking if all top-level must sees are true
                let markingKeys = Object.keys(markingLocation);
                let mustSeeIds = Object.values(mustSeeData).map((mustSeeEntry) => mustSeeEntry.id);
                if (mustSeeIds.every((mustSeeId) => markingKeys.includes(mustSeeId))) {
                    individualEntry.result = true;
                    resultSec.dispatchEvent(new CustomEvent("resultChange", { detail: true }));
                }
            }
        });
        mainDiv.appendChild(checkboxSpan);
        //expansion button
        let expansionButton = createElement("button", checkboxSpan, "▶", "expansionButton");
        expansionButton.setAttribute("data-mustsee", mustSee.id);
        expansionButton.style.display = true > 0 ? "block" : "none";
        expansionButton.addEventListener("click", (e) => {
            if (!document.body.querySelector(".extraMustSeeContainer")) {
                e.stopPropagation();
            }
            expansionButton.classList.add("active");
            showExpansionList(mustSee, expansionButton);
        });
        updateShowable(mustSee, expansionButton);

    });

    perSituationMarkingChannel.addListeningFunction(() => {
        //Each must-see
        mustSeeData.forEach((mustSee) => {
            //Expansion button
            let expansionButton = mainDiv.querySelector(`button.expansionButton[data-mustsee="${mustSee.id}"]`);
            updateShowable(mustSee, expansionButton);
            //Checkbox
            if (individualEntry.marking.length <= selectedSituation) {
                //Per-team marking and this person's team has fewer situations. They do not have data for this situation
                return;
            }
            let checkbox = mainDiv.querySelector(`result-input[data-mustsee="${mustSee.id}"]`);
            let userRawVal = individualEntry.marking[selectedSituation][mustSee.id] ?? null;
            checkbox.value = userRawVal;
        });
        //Handle hiding/showing
        if (individualEntry.marking.length <= selectedSituation) {
            //Per-team marking and this person's team has fewer situations. They do not have data for this situation
            mainDiv.style.visibility = "hidden";
            mainDiv.parentElement.querySelector("textarea").disabled = true;
            return;
        } else {
            //The user does have marking data for this situation, show.
            mainDiv.style.visibility = "visible";
            mainDiv.parentElement.querySelector("textarea").disabled = false;
        }
    });

    function updateShowable(mustSee, button) {
        var fromDesignerSituations = determineIncludedSituationSkills(mustSee).filter((el) => el !== null);
        let combinedSkillsToShow = (mustSee.mustSees ?? []).concat(fromDesignerSituations);
        button.style.display = combinedSkillsToShow.length > 0 ? "block" : "none";
    }

    function showExpansionList(mustSee, expansionButton) {
        var fromDesignerSituations = determineIncludedSituationSkills(mustSee).filter((el) => el !== null);
        let combinedSkillsToShow = (mustSee.mustSees ?? []).concat(fromDesignerSituations);
        let expansionHolder = createElement("div", document.body, null, "extraMustSeeContainer scrollbar");
        expansionHolder.addEventListener("click", (e) => {
            e.stopPropagation();
        })
        //Positioning Y
        let buttonRect = expansionButton.getBoundingClientRect();
        let buttonVerticalMiddle = buttonRect.top + (buttonRect.height / 2);
        let expansionRect = expansionHolder.getBoundingClientRect();
        let finalY = buttonVerticalMiddle - (expansionRect.height / 2);
        expansionHolder.style.top = `${finalY}px`;
        //Positioning X - Pick a side, preference for right
        let windowWidth = window.innerWidth;
        let remainingRight = windowWidth - buttonRect.right;
        if (remainingRight > expansionRect.width) {
            //Right positioning
            expansionHolder.style.left = `${buttonRect.right}px`;
        } else {
            //Left positioning
            expansionHolder.style.left = `${buttonRect.left - expansionRect.width}px`;
        }
        //nav menu if needed
        let expansionWindowedNav = combinedSkillsToShow.length > 1;
        if (expansionWindowedNav) {
            //Holder
            expansionNavScreen = createElement("div", expansionHolder, null, "extraMustSeeScreen navMenu");
            expansionNavScreen.setAttribute("data-navigation", "*");
            expansionNavScreen.style.left = "0%";
            //Scroll list
            let expansionScrollList = createElement("div", expansionNavScreen, null, "extraMustSeeList scrollbar");
            //Populate must-sees
            combinedSkillsToShow.forEach((mustSeeName) => {
                let skillSpan = createElement("span", expansionScrollList, null, "extraMustSeeSpan");
                let nameText = decodeSkillReference(mustSeeName).name;
                createElement("label", skillSpan, nameText, "markingLabel");
                //Button
                createElement("label", skillSpan, "▶", "expansionButton");
                skillSpan.addEventListener("click", () => {
                    expansionNavScreen.style.left = "-100%";
                    let skillExpansion = expansionHolder.querySelector(`div[data-navigation="${mustSeeName}"]`);
                    skillExpansion.style.left = "0%";
                });
            });
        }
        //populate the skill lists
        combinedSkillsToShow.forEach((mustSeeName) => {
            var referencedMustSeeSkill = decodeSkillReference(mustSeeName);
            if (!referencedMustSeeSkill.mustSees) {
                return;
            }
            //Create skill must-see screen
            let skillExpansionList = createElement("div", expansionHolder, null, "extraMustSeeScreen");
            skillExpansionList.setAttribute("data-navigation", mustSeeName);
            //Title
            if (expansionWindowedNav) {
                let titleSpan = createElement("span", skillExpansionList, null, "extraMustSeeSpan title");
                titleSpan.addEventListener("click", () => {
                    skillExpansionList.style.left = "100%";
                    let navScreen = expansionHolder.querySelector(`div[data-navigation="*"]`);
                    navScreen.style.left = "0%";
                })
                createElement("b", titleSpan, `◀ ${referencedMustSeeSkill.name}`, "");
            } else {
                skillExpansionList.style.left = "0%";
            }
            //scroll list
            let expansionScrollList = createElement("div", skillExpansionList, null, "extraMustSeeList scrollbar");
            //Must-sees
            if (referencedMustSeeSkill.mustSees.length === 0) {
                createElement("label", expansionScrollList, "No must-sees to display", null);
            }
            referencedMustSeeSkill.mustSees.forEach((refMustSee) => {
                let createdSpan = createListItem(refMustSee, `${mustSeeName}/${refMustSee.id}`, individualEntry, (checkbox) => {
                    //Custom function passed to checkbox change listener that sets the root (main item) must-see to failed if any must-see in the menu is failed
                    if (checkbox.value !== false) {
                        return;
                    }
                    let rootCheckbox = mainDiv.querySelector(`result-input[data-mustsee="${mustSee.id}"]`);
                    rootCheckbox.value = false;
                    rootCheckbox.dispatchEvent(new Event("change"));
                    //mustSee
                });
                createdSpan.className = "extraMustSeeSpan";
                expansionScrollList.appendChild(createdSpan);
            })
        })
        //Handle closing the list
        document.body.addEventListener("click", handleClose, { once: true });

        document.querySelectorAll(".individualMustSeeHolder").forEach((el) => {
            el.addEventListener("scroll", handleClose, { once: true })
        });

        markingHolder.addEventListener("scroll", handleClose, { once: true });

        function handleClose(e) {
            if (e) {
                e.preventDefault();
            }
            expansionButton.classList.remove("active");
            expansionHolder.remove();
        }
    }

    function determineIncludedSituationSkills(forMustSee) {
        if (!flagConfigs['situationDesigner'] || !forMustSee.fromSituationDesigner) {
            return [];
        }
        let configuredEntry = flagConfigs['globalSituations'] ? individualEntry.teamReference.markingReference : individualEntry.teamReference;
        let situationData = configuredEntry.situationData.map((val) => getSkillFromListReference(val, sheetToolkitData));
        if (!situationData) {
            return [];
        }
        let possibleSituations = [];
        //Calculate all situations that can be included
        forMustSee?.fromSituationDesigner.forEach((referenceStr) => {
            if (referenceStr.endsWith("/*")) {//Whole list is eligible
                let list = getListReference(referenceStr.slice(0, -2), sheetToolkitData);
                possibleSituations = possibleSituations.concat(list.values.map((valueEntry) => valueEntry.skill)).flat();
            } else {//Only a specific skill is eligible
                let listName = referenceStr.split("/")[0];
                let skillName = referenceStr.split("/")[1];
                let list = getListReference(listName, sheetToolkitData);
                possibleSituations = possibleSituations.concat(list.values.find((valueEntry) => valueEntry.id === skillName).skill).flat();
            }
        });
        //If an item does not have a skill reference, it would have inserted an undefined value. Purge them
        possibleSituations = possibleSituations.filter((entry) => entry !== null && entry !== undefined);
        //Go through each situation
        if (selectedSituation === -1) {
            //Global
            return [...new Set(possibleSituations.filter((possibleSit) => situationData.includes(possibleSit)))];
        } else {
            return [possibleSituations.find((possibleSit) => situationData[selectedSituation] === possibleSit) ?? null];
        }
    }

    function createListItem(data, path, individualEntry, customChangeFn) {
        let markingLocation = determineIfPerSituationMarking(flagConfigs) ? individualEntry.marking[selectedSituation] : individualEntry.marking;
        //HTML
        let checkboxSpan = createElement("span", null, null, "markingCheckboxSpan");
        let lbl = createElement("label", checkboxSpan, null, "markingLabel");
        var checkboxInput = createElement("result-input", lbl, null, null);
        checkboxInput.setAttribute("type", getToolkitSetting("markingMode", toolkitData.settings['markingMode'].default));
        //value
        let userRawVal = markingLocation[path] ?? null;
        checkboxInput.value = userRawVal;
        //Configure input
        checkboxInput.setAttribute("data-mustsee", path);
        //Connect label to input
        lbl.addEventListener("click", (e) => {
            //prevent doubling of event triggers for the internal click handlers
            if (e.target !== checkboxInput) {
                checkboxInput.toggle()
            }
        })
        //Checkbox state change
        checkboxInput.addEventListener("change", () => {
            markingLocation = determineIfPerSituationMarking(flagConfigs) ? individualEntry.marking[selectedSituation] : individualEntry.marking;
            if (checkboxInput.value !== null) {
                //Add
                markingLocation[path] = checkboxInput.value;
            } else {
                //Remove
                delete markingLocation[path];
            }
            if (customChangeFn) {
                customChangeFn(checkboxInput);
            }
            //Fire event
            markingChangeChannel.notify(individualEntry)
            markChange();
        })
        lbl.appendChild(checkboxInput);
        lbl.appendChild(document.createTextNode(data.text));
        return checkboxSpan;
    }
    return mainDiv;
}

//If a string is supplied, tries to find the value set by the user in their settings, or the default if not specified by the user.
//String is the name of the variable
function resolveConfigValue(value) {
    if (typeof value === "string") {
        //Is a string - could be a variable
        if (toolkitData.settings[value]) {
            //Is a variable that is defined in the json
            //return the user's value, or default if not set
            return getToolkitSetting(value, toolkitData.settings[value].default);
        } else {
            return value;
        }
    } else {
        return value;
    }
}

function getToolkitSetting(settingName, defaultValue) {
    let val = userToolkitSettings[settingName];
    return val ?? defaultValue;
}

let markingNavigationBackground = document.getElementById("markingNavigationBackground");
document.getElementById("markingSubNavigationButton").onclick = function () {
    markingNavigationBackground.classList.remove("initial")
    if (markingNavigationBackground.classList.contains("hide")) {
        markingNavigationBackground.classList.remove("hide");
        markingNavigationBackground.classList.add("show");
        markingNavigationBackground.addEventListener("click", closeNavigation, { once: true });
        showMarkingNavigationList();
    } else {
        closeNavigation();
    }

    function closeNavigation() {
        markingNavigationBackground.classList.remove("show");
        markingNavigationBackground.classList.add("hide");
        markingNavigationBackground.removeEventListener("click", closeNavigation);
    }
}

const markingSubNewEvalButton = document.getElementById("markingSubNewEvalButton");
const groupList = document.getElementById("groupList");
markingSubNewEvalButton.onclick = async function () {
    markingSubNewEvalButton.disabled = true;
    try {
        let configStore = (await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.READONLY, "configurations")).getStore("configurations");
        let groupData = (await configStore.get(getGroupKey())) ?? [];
        if (groupData.length > 0) {
            complexCreateOperation(groupData);
        } else {
            newEvaluationCreateOperation();
        }
    } catch (err) {
        newEvaluationCreateOperation();
    }

    function complexCreateOperation(groupingData) {
        //UI Changes
        hideAllChildren(dialogContainer);
        dialogContainer.style.display = "block";
        newEvalComplexDialog.style.display = "flex";
        markingSubNewEvalButton.disabled = false;
        //Show list
        clearChildren(groupList);
        groupingData.forEach((group, i) => {
            //Holder
            let groupHolder = createElement("div", groupList, "", "groupEntry");
            //Text
            let nameText = group.flat().map((id) => getCandidateName(id));
            createElement("p", groupHolder, nameText.join(", "), "");
            //Delete button
            let deleteBtn = createElement("button", groupHolder, "delete", "deleteBtn material-symbols-outlined");
            deleteBtn.addEventListener("click", async () => {
                if (confirm("Delete this evaluation group?")) {
                    deleteBtn.disabled = true;
                    try {
                        let configStore = (await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.WRITE, "configurations")).getStore("configurations");
                        let loadedGroups = (await configStore.get(getGroupKey())) ?? [];
                        if (JSON.stringify(loadedGroups.at(i)) !== JSON.stringify(group)) {//Integrity check
                            deleteBtn.disabled = false;
                            return;
                        }
                        loadedGroups.splice(i, 1);
                        await configStore.put(loadedGroups, getGroupKey());
                        groupHolder.remove();
                    } catch (err) {
                        console.log(err);
                        deleteBtn.disabled = false;
                    }
                }
            })
            //Create button
            let createBtn = createElement("button", groupHolder, "Create", "createBtn");
            createBtn.addEventListener("click", () => {
                createBtn.disabled = true;
                newEvaluationCreateOperation(group);
            })
        })
    }
}

const newEvalComplexBlankButton = document.getElementById("newEvalComplexBlankButton");
async function newEvaluationCreateOperation(preloadedTeams = []) {
    newEvalComplexBlankButton.disabled = true;
    try {
        await forceSave();
        let markingEntry = new SkillMarkingEntry(null, sheetContainer.dbKey, currentMarkingToolkit.skillId, SAVE_STATUS.INITIAL);
        preloadedTeams.forEach((team) => {
            let teamEntry = markingEntry.addTeamEntry();
            team.forEach((individualResponseId) => {
                teamEntry.addIndividualEntry(individualResponseId);
            })
        })
        navigateToMarkingSkillScreen(markingEntry);
        markingSubNewEvalButton.disabled = false;
    } catch (err) {
        console.log(err);
        alert("Unable to create new evaluation. Please try again later.");
    } finally {
        newEvalComplexBlankButton.disabled = false;
        dialogContainer.style.display = "none";
    }
}
newEvalComplexBlankButton.addEventListener("click", () => { newEvaluationCreateOperation() });

const markingNavigationList = document.getElementById("markingNavigationList");
async function showMarkingNavigationList() {
    clearChildren(markingNavigationList);
    //Get group info
    var storedGroups;
    try {
        let configStore = (await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.READONLY, "configurations")).getStore("configurations");
        storedGroups = (await configStore.get(getGroupKey())) ?? [];
    } catch (err) {
        storedGroups = null;
    }
    var ToolkitSkillInterpreter = new ToolkitMappingFullInterpreter(sheetContainer).getSkill(currentMarkingToolkit.skillId);
    ToolkitSkillInterpreter?.forEach((entryInterpreter, i) => {
        let isCurrent = entryInterpreter.getId() === currentMarkingToolkit.dbKey;
        let mappingHolder = createElement("div", markingNavigationList, "", "markingNavListEntry");
        if (isCurrent) {
            mappingHolder.classList.add("current");
        }
        //Titles
        let mappingTitleHolder = createElement("span", mappingHolder, null, "markingNavTitleHolder");
        createElement("b", mappingTitleHolder, `Evaluation #${i + 1}`, "");
        let mappingCandidateNameHolder = createElement("span", mappingTitleHolder, null, "markingNavCandidateHolder");
        if (!sheetContainer.matching['Name']) {
            createElement("p", mappingCandidateNameHolder, "Candidate Names not Available", "");
        } else if (entryInterpreter.getCandidateCount() === 0) {
            createElement("p", mappingCandidateNameHolder, "No Candidates", "");
        } else {
            entryInterpreter.getCandidateIds().forEach((responseId) => {
                let candidateName = getCandidateName(responseId);
                createElement("p", mappingCandidateNameHolder, candidateName, "");
            })
        }
        //Buttons
        let mappingButtonHolder = createElement("span", mappingHolder, null, "markingNavButtonHolder");
        let mappingDeleteButton = createElement("button", mappingButtonHolder, "delete", "material-symbols-outlined deleteButton");
        mappingDeleteButton.title = "Delete Evaluation";
        mappingDeleteButton.addEventListener("click", async () => {
            //confirmation
            if (!confirm(`Delete evaluation #${i + 1}`)) {
                return;
            }
            //Disable buttons during operation
            mappingDeleteButton.disabled = true;
            mappingOpenButton.disabled = true;
            try {
                //attempt delete
                await dataManagerInstance.deleteToolkitInstance(entryInterpreter.getId(), sheetContainer, currentMarkingToolkit.skillId);
                //Remove from list UI
                mappingHolder.remove();
                //Check if that sheet is being displayed
                if (entryInterpreter.getId() === currentMarkingToolkit.dbKey) {
                    //load the most recent evaluation
                    loadMostRecentOrNewToolkit(currentMarkingToolkit.skillId);
                }
            } catch (err) {
                console.log(err)
                alert("Error deleting evaluation. Please try again later");
                mappingDeleteButton.disabled = false;
                mappingOpenButton.disabled = false;
            }
        })
        //Group button
        if (storedGroups) {
            let mappingGroupAddButton = createElement("button", mappingButtonHolder, "group_add", "groupingButton material-symbols-outlined");
            mappingGroupAddButton.title = "Create Evaluation Group";
            //Disable if group already exists
            let mappingTeamIds = entryInterpreter.getGroupingTeamData();
            if (storedGroups.some((groupInfo) => JSON.stringify(groupInfo) === JSON.stringify(mappingTeamIds))) {
                mappingGroupAddButton.disabled = true;
            }
            //Handle click
            mappingGroupAddButton.addEventListener("click", () => {
                mappingGroupAddButton.disabled = true;
                addCurrentSheetToGroups(mappingTeamIds).catch((err) => {
                    console.log(err)
                    mappingGroupAddButton.disabled = false;
                })
            })
        }
        //Open button 
        let mappingOpenButton = createElement("button", mappingButtonHolder, "View", "openButton");
        mappingOpenButton.title = "View Evaluation";
        if (isCurrent) {
            mappingOpenButton.disabled = true;
        }
        mappingOpenButton.addEventListener("click", async () => {
            //Disable open button
            mappingOpenButton.disabled = true;
            //Save
            try {
                await forceSave();
                //Load the requested toolkit
                let toolkitKey = entryInterpreter.getId();
                let loadedToolkitEntry = await dataManagerInstance.getToolkitInstance(toolkitKey, sheetContainer);
                navigateToMarkingSkillScreen(loadedToolkitEntry);
            } catch (err) {
                alert("Unable to open evaluation. Please try again later.");
                mappingOpenButton.disabled = false;
            }
        })
    })

    async function addCurrentSheetToGroups(candidatesObj) {
        let configStore = (await indexedDbManagerInstance.startTransaction(TRANSACTION_MODE.WRITE, "configurations")).getStore("configurations");
        let currentGroups = await configStore.get(getGroupKey()) ?? [];
        currentGroups.push(candidatesObj);
        configStore.put(currentGroups, getGroupKey());
    }
}

function getGroupKey() {
    return `groups-${sheetContainer.dbKey}-${sheetContainer.getSheetIdentifier()}-${currentMarkingToolkit.skillId}`
}

document.getElementById("markingNavigationHolder").addEventListener("click", (e) => {
    e.stopPropagation();
});

document.getElementById("markingNavigationHomeButton").onclick = function () {
    navigateToSkillsListScreen();
    forceSave();
}

document.getElementById("markingNavigationResultButton").onclick = function () {
    navigateToResultsScreen();
    forceSave();
}

document.getElementById("overviewSubResultsButton").addEventListener("click", () => {
    navigateToResultsScreen();
})

async function loadMostRecentOrNewToolkit(skillId) {
    let toolkitInterpreter = new ToolkitMappingFullInterpreter(sheetContainer).getSkill(skillId);
    if (!toolkitInterpreter || toolkitInterpreter.getNumberOfEntries() === 0) {
        navigateToMarkingSkillScreen(new SkillMarkingEntry(null, sheetContainer.dbKey, skillId, SAVE_STATUS.INITIAL));
    } else {
        try {
            let toolkitKey = toolkitInterpreter.getLastEntry().getId();
            let loadedToolkitEntry = await dataManagerInstance.getToolkitInstance(toolkitKey, sheetContainer);
            navigateToMarkingSkillScreen(loadedToolkitEntry);
        } catch (err) {
            console.log(err);
            throw err;
        }
    }
}

document.querySelectorAll(".resultToolkitHomeButton").forEach((btn) => {
    btn.addEventListener("click", () => {
        navigateToSkillsListScreen();
    });
})

function determineIfPerSituationMarking(flagConfigs) {
    //Look for an existing individual to determine
    let individual = currentMarkingToolkit.teams?.find((team) => team.individuals.length > 0)?.individuals[0] ?? null;
    if (individual && individual.marking) {
        return Array.isArray(individual.marking);
    }
    //If not, use the sheet default value
    return flagConfigs['perSituationMarking'];
}

const resultDisplayList = document.getElementById("resultDisplayList");
const resultSearchBar = document.getElementById("resultSearchBar");
const resultSortTypeSelect = document.getElementById("resultSortTypeSelect");
const resultCardTemplate = document.getElementById("resultCardTemplate");
const resultCardEntryTemplate = document.getElementById("resultCardEntryTemplate");

const resultSummaryReportButton = document.getElementById("resultSummaryReportButton");
var resultToolkitDatas = {};

function navigateToResultsScreen() {
    history.pushState({ key: null, page: "results" }, "");
    showResultsScreen();
}

function showResultsScreen() {
    showSection(resultSection);
    //Reset screen
    clearChildren(resultDisplayList);
    resultSearchBar.value = "";
    resultSortTypeSelect.value = "candidate";
    renderResultsList();
    resultSortTypeSelect.addEventListener("change", renderResultsList);
    //Clear old data
    resultToolkitDatas = {}
    function renderResultsList() {
        clearChildren(resultDisplayList);
        let queryType = resultSortTypeSelect.value;
        var cardCount = 0;
        //Determine how many cards are needed
        switch (queryType) {
            case "candidate":
                cardCount = sheetContainer.getNumberOfResponses();
                break;
            case "skill":
                let interpreter = new ToolkitMappingFullInterpreter(sheetContainer);
                cardCount = interpreter.getNumberOfSkills();
                break;
        }
        //Render cards
        for (let i = 0; i < cardCount; i++) {
            let card = createSkeleton(resultCardTemplate, resultDisplayList, false);
            var queryValue;
            //Set load button
            let loadButton = card.querySelector("button.resultCardLoadButton")
            loadButton.disabled = false;
            //set title text
            switch (queryType) {
                case "candidate":
                    if (!sheetContainer.matching['Name']) {
                        card.querySelector("h1.resultCardLoadTitle").textContent = "Name not available";
                    } else {
                        let allResponseIds = Object.keys(sheetContainer.getResponses());
                        queryValue = allResponseIds[i];
                        card.querySelector("h1.resultCardLoadTitle").textContent = sheetContainer.getResponse(queryValue).getAnswer(sheetContainer.matching['Name']).answerContent;
                    }
                    break;
                case "skill":
                    let interpreter = new ToolkitMappingFullInterpreter(sheetContainer)
                    queryValue = interpreter.getSkillsList()[i];
                    let skillRef = toolkitData.sheets[sheetContainer.getSheetIdentifier()].skills[queryValue];
                    card.querySelector("h1.resultCardLoadTitle").textContent = skillRef.name;
                    break;
            }
            card.setAttribute("data-value", queryValue);
            //Skeleton background
            var resultList = card.querySelector("div.resultList");
            for (let s = 0; s < 4; s++) {
                createSkeleton(resultCardEntryTemplate, resultList, true);
            }
            //Handle load
            loadButton.addEventListener("click", async () => {
                //Remove the load button screen
                card.querySelector(".resultCardOverlay").style.display = "none";
                var rawValue = card.getAttribute("data-value");
                var queryRelatedIds;//Stores the response from the server that documents all ids it considers relevant to the query, regardless of it the server
                //returned that sheet.
                //get data
                try {
                    let loadedSheetData = await dataManagerInstance.queryToolkitResults(sheetContainer.dbKey, queryType, rawValue, Object.keys(resultToolkitDatas));
                    queryRelatedIds = loadedSheetData.relevantIds;
                    for (const [sheetId, sheetObj] of Object.entries(loadedSheetData.sheets)) {
                        resultToolkitDatas[sheetId] = sheetObj;
                    }
                    if (loadedSheetData.networkStatus === SAVE_STATUS.LOCAL_SAVED) {
                        card.querySelector("span.resultCardOfflineIndicator").style.display = "flex";
                    }
                } catch (err) {
                    console.log(err)
                    card.querySelector(".resultCardOverlay").style.display = "flex";
                    alert("Unable to load results. Check your connection and try again");
                    return;
                }
                //Setup from skeleton
                card.classList.remove("skeleton-container");
                var cardResultList = card.querySelector("div.resultList");
                clearChildren(cardResultList);
                let pdfGenerateButton = card.querySelector(".resultGeneratePdfButton");
                pdfGenerateButton.disabled = false;
                //Handle types
                switch (queryType) {
                    case "candidate":
                        card.querySelector(".resultTitle").textContent = sheetContainer.getResponse(rawValue).getAnswer(sheetContainer.matching['Name']).answerContent;
                        let includedSkills = findIncludedCandidateSkills(queryRelatedIds);
                        includedSkills.forEach((skillId) => {
                            let skillName = toolkitData.sheets[sheetContainer.getSheetIdentifier()]?.skills[skillId]?.name ?? "Skill Name Unavailable";
                            //queryRelatedIds span multiple skills, pick only the Ids that correspond to this skill
                            //Make a map
                            let toolkitSkillIdMap = queryRelatedIds.map((id) => [id, resultToolkitDatas[id].skillId]);
                            //Filter the map for the needed skillId and then convert back to an array of toolkit keys
                            let skillRelatedIds = toolkitSkillIdMap.filter(([id, toolkitSkillId]) => toolkitSkillId === skillId).map((mapEntry) => mapEntry[0]);
                            let renderData = generateCandidateRenderData(rawValue, skillId, skillRelatedIds);
                            createCardListEntry(cardResultList, renderData, skillName);
                        })
                        break;
                    case "skill":
                        let skillRef = toolkitData.sheets[sheetContainer.getSheetIdentifier()].skills[queryValue];
                        card.querySelector(".resultTitle").textContent = skillRef.name;
                        let includedCandidates = findIncludedSkillCandidates(queryRelatedIds);
                        includedCandidates.forEach((candidateResponseId) => {
                            //Candidate name
                            let candidateName = getCandidateName(candidateResponseId);
                            //Generate render data
                            let renderData = generateSkillRenderData(rawValue, candidateResponseId, queryRelatedIds);
                            createCardListEntry(cardResultList, renderData, candidateName);
                        });
                        break;
                }
                pdfGenerateButton.addEventListener("click", () => {
                    var renderDatas = [];
                    var reportTitle = "";
                    switch (queryType) {
                        case "candidate":
                            reportTitle = sheetContainer.getResponse(rawValue).getAnswer(sheetContainer.matching['Name']).answerContent;
                            let includedSkills = findIncludedCandidateSkills(queryRelatedIds);
                            includedSkills.forEach((skillId) => {
                                let skillName = toolkitData.sheets[sheetContainer.getSheetIdentifier()]?.skills[skillId]?.name ?? "Skill Name Unavailable";
                                //queryRelatedIds span multiple skills, pick only the Ids that correspond to this skill
                                //Make a map
                                let toolkitSkillIdMap = queryRelatedIds.map((id) => [id, resultToolkitDatas[id].skillId]);
                                //Filter the map for the needed skillId and then convert back to an array of toolkit keys
                                let skillRelatedIds = toolkitSkillIdMap.filter(([id, toolkitSkillId]) => toolkitSkillId === skillId).map((mapEntry) => mapEntry[0]);
                                renderDatas.push({ name: skillName, data: generateCandidateRenderData(rawValue, skillId, skillRelatedIds) });
                            });
                            break;
                        case "skill":
                            reportTitle = toolkitData.sheets[sheetContainer.getSheetIdentifier()].skills[queryValue].name;
                            let includedCandidates = findIncludedSkillCandidates(queryRelatedIds);
                            includedCandidates.forEach((candidateResponseId) => {
                                //Candidate name
                                let candidateName = getCandidateName(candidateResponseId);
                                renderDatas.push({ name: candidateName, data: generateSkillRenderData(rawValue, candidateResponseId, queryRelatedIds) });
                            });
                            break;
                    }
                    new ResultReportGenerator().generateIndividualPdfReport(reportTitle, renderDatas).open();
                });
            });
        }
    }

    function generateCandidateRenderData(responseId, skillId, relatedIds) {
        let relatedToolkits = relatedIds.map((id) => resultToolkitDatas[id])
        //Create structured data for population
        let interpreter = new ToolkitMappingFullInterpreter(sheetContainer).getSkill(skillId);
        var idOrderingArray = interpreter.getAllEntries().map((entryInterpreter) => entryInterpreter.getId());
        //Put in same order as the mapping document
        relatedToolkits.sort((a, b) => idOrderingArray.indexOf(a.dbKey) - idOrderingArray.indexOf(b.dbKey));
        return relatedToolkits.map((toolkit) => {
            let individual = toolkit.teams.flatMap(team => team.individuals).find(i => i.responseId === responseId);
            if (!individual) {
                return null;
            }
            return {
                individual: individual,//find the candidate inside the team and set as final value
                label: `Evaluation #${idOrderingArray.indexOf(toolkit.dbKey) + 1}`,
                skillId: skillId,
                toolkitKey: toolkit.dbKey
            }
        }).filter((entry) => entry !== null)
    }

    function findIncludedCandidateSkills(relatedIds) {
        const masterSkillOrder = Object.keys(toolkitData.sheets[sheetContainer.getSheetIdentifier()].skills);
        let includedSkills = relatedIds.map((id) => resultToolkitDatas[id].skillId);
        includedSkills.sort((a, b) => masterSkillOrder.indexOf(a) - masterSkillOrder.indexOf(b));
        return [...new Set(includedSkills)];//de-duplicate
    }

    function generateSkillRenderData(skillId, responseId, relatedIds) {
        let relatedToolkits = relatedIds.map((id) => resultToolkitDatas[id])
        let interpreter = new ToolkitMappingFullInterpreter(sheetContainer).getSkill(skillId);
        var idOrderingArray = interpreter.getAllEntries().map((entryInterpreter) => entryInterpreter.getId());
        return relatedToolkits.map((toolkit) => {
            let individual = toolkit.teams.flatMap(team => team.individuals).find(i => i.responseId === responseId);
            if (!individual) {
                return null;
            }
            return {
                individual: individual,
                label: `Evaluation #${idOrderingArray.indexOf(toolkit.dbKey) + 1}`,
                skillId: skillId,
                toolkitKey: toolkit.dbKey
            }
        }).filter((entry) => entry !== null);

    }

    function findIncludedSkillCandidates(relatedIds) {
        //Find each candidate that should be included
        let includedCandidates = relatedIds.map((id) => resultToolkitDatas[id]).map((sheet) => sheet.teams.map((team) =>
            team.individuals.map((individual) => individual.responseId)
        )).flat(2).filter((id) => id !== null);//flatten to a single dimension, strip nulls
        return [...new Set(includedCandidates)];//de-duplicate
    }

    function createCardListEntry(cardList, renderData, title) {
        var fragment = resultCardEntryTemplate.content.cloneNode(true);
        var templateRoot = fragment.firstElementChild;
        //Make a copy of the template data
        let entryEl = templateRoot.cloneNode(true);
        entryEl.querySelector(".resultEntrySectionTitle p").textContent = title;
        //clear out the list data
        let list = entryEl.querySelector(".resultEntrySectionList");
        clearChildren(list);
        //append
        cardList.appendChild(entryEl);
        //Button
        var totalHeight = 0;
        let collapseBtn = entryEl.querySelector("button.sectionCollapseButton");
        collapseBtn.addEventListener("click", () => {
            list.classList.toggle("hide");
            if (list.classList.contains("hide")) {
                list.style.height = "0px";
                collapseBtn.textContent = "⮟"
            } else {
                list.style.height = `${totalHeight}px`;
                collapseBtn.textContent = "⮝"
            }
        })
        //Render the list
        renderData.forEach((data) => {
            //Attempt header
            let resultHeader = templateRoot.querySelector(".resultEntryTitleSection").cloneNode(true);
            list.appendChild(resultHeader);
            resultHeader.querySelector("p.resultEntryTitle").textContent = data.label;
            //Header pass/fail
            if (data.individual.result !== null) {
                resultHeader.classList.add(data.individual.result === true ? "pass" : "fail");
                resultHeader.querySelector(".resultSectionResultIndicator").classList.add(data.individual.result === true ? "pass" : "fail");
                resultHeader.querySelector(".resultSectionResultIndicator p").textContent = data.individual.result === true ? "Pass" : "Fail";
            }
            //header click to see evaluation
            resultHeader.addEventListener("click", async () => {
                //Load
                try {
                    let referencedToolkit = await dataManagerInstance.getToolkitInstance(data.toolkitKey, sheetContainer);
                    navigateToMarkingSkillScreen(referencedToolkit);
                } catch (err) {
                    alert("Unable to view evaluation");
                    console.log(err);
                }
            })
            //Must-sees
            ResultReportGenerator.reportProcessSortedMustSees(sheetContainer.getSheetIdentifier(), data.skillId, data.individual, (text, result) => {
                let mustSeeEl = templateRoot.querySelector(".resultEntrySectionListItem").cloneNode(true);
                list.appendChild(mustSeeEl);
                mustSeeEl.querySelector("p.resultEntrySectionListText").textContent = text;
                mustSeeEl.querySelector(".resultSectionResultIndicator").classList.add(result === true ? "pass" : "fail");
                mustSeeEl.querySelector(".resultSectionResultIndicator p").textContent = result === true ? "Pass" : "Fail";
            }, (situationName) => {
                let mustSeeEl = templateRoot.querySelector(".resultEntrySectionSituationItem").cloneNode(true);
                list.appendChild(mustSeeEl);
                mustSeeEl.querySelector("p.resultEntrySectionSituationText").textContent = situationName;
            })
            //Notes
            let noteSection = templateRoot.querySelector(".resultEntrySectionNoteSection").cloneNode(true);
            list.appendChild(noteSection);
            noteSection.querySelector("textarea").value = data.individual.commentData;
        })
        //Set height
        var boundBox = list.getBoundingClientRect();
        totalHeight = boundBox.height;
        list.style.height = `${totalHeight}px`;
    }

    resultSummaryReportButton.onclick = async function () {
        resultSummaryReportButton.disabled = true;
        let queryType = resultSortTypeSelect.value;
        let queryRelatedIds;
        try {
            let loadedSheetData = await dataManagerInstance.queryToolkitResults(sheetContainer.dbKey, queryType, "*", Object.keys(resultToolkitDatas));
            queryRelatedIds = loadedSheetData.relevantIds;
            for (const [sheetId, sheetObj] of Object.entries(loadedSheetData.sheets)) {
                resultToolkitDatas[sheetId] = sheetObj;
            }
        } catch (err) {
            console.log(err);
            alert("Unable to generate summary report. Check your connection and try again");
            return;
        } finally {
            resultSummaryReportButton.disabled = false;
        }
        var renderDatas = [];
        reportTitle = "";
        switch (queryType) {
            case "candidate":
                reportTitle = "Candidates";
                findIncludedSkillCandidates(queryRelatedIds).forEach((candidateResponseId) => {
                    let renderEntries = [];
                    let sectionTitle = getCandidateName(candidateResponseId);
                    let includedSkills = findIncludedCandidateSkills(queryRelatedIds);
                    includedSkills.forEach((skillId) => {
                        let skillName = toolkitData.sheets[sheetContainer.getSheetIdentifier()]?.skills[skillId]?.name ?? "Skill Name Unavailable";
                        //queryRelatedIds span multiple skills, pick only the Ids that correspond to this skill
                        //Make a map
                        let toolkitSkillIdMap = queryRelatedIds.map((id) => [id, resultToolkitDatas[id].skillId]);
                        //Filter the map for the needed skillId and then convert back to an array of toolkit keys
                        let skillRelatedIds = toolkitSkillIdMap.filter(([id, toolkitSkillId]) => toolkitSkillId === skillId).map((mapEntry) => mapEntry[0]);
                        renderEntries.push({ name: skillName, data: generateCandidateRenderData(candidateResponseId, skillId, skillRelatedIds) });
                    });
                    renderDatas.push({ title: sectionTitle, renderData: renderEntries });
                });
                break;
            case "skill":
                reportTitle = "Skills";
                findIncludedCandidateSkills(queryRelatedIds).forEach((skillId) => {
                    console.log(skillId);
                    let renderEntries = [];
                    let sectionTitle = toolkitData.sheets[sheetContainer.getSheetIdentifier()].skills[skillId].name;
                    //queryRelatedIds span multiple skills, pick only the Ids that correspond to this skill
                    let toolkitSkillIdMap = queryRelatedIds.map((id) => [id, resultToolkitDatas[id].skillId]);
                    let skillRelatedIds = toolkitSkillIdMap.filter(([id, toolkitSkillId]) => toolkitSkillId === skillId).map((mapEntry) => mapEntry[0]);
                    let includedCandidates = findIncludedSkillCandidates(queryRelatedIds);
                    includedCandidates.forEach((candidateResponseId) => {
                        //Candidate name
                        let candidateName = getCandidateName(candidateResponseId);
                        renderEntries.push({ name: candidateName, data: generateSkillRenderData(skillId, candidateResponseId, skillRelatedIds) });
                    });
                    renderDatas.push({ title: sectionTitle, renderData: renderEntries });
                });
                break;
        }
        new ResultReportGenerator().generateOverviewPdfReport(reportTitle, renderDatas).open();
    };
}

function getCandidateName(responseId) {
    if (sheetContainer.matching['Name']) {
        if (responseId === null) {
            return "(Empty)"
        }
        return sheetContainer.getResponse(responseId)?.getAnswer(sheetContainer.matching['Name']).answerContent ?? "Name Not Available";
    } else {
        return "Name Not Available";
    }
}

//Settings

const settingsApplyButton = document.getElementById("settingsApplyButton")
document.getElementById("markingNavigationSettingsButton").addEventListener("click", () => {
    showSettingsScreen();
    hideAllChildren(dialogContainer);
    dialogContainer.style.display = "block";
    settingsDialog.style.display = "flex";
    settingsApplyButton.disabled = false;
})

// getToolkitSetting(settingName, defaultValue)
const settingsForm = document.getElementById("settingsForm");
function showSettingsScreen() {
    for (const [settingName, settingInformation] of Object.entries(toolkitData.settings)) {
        if (settingInformation.type === "boolean") {
            settingsForm.elements[settingName].checked = getToolkitSetting(settingName, settingInformation.default);
        } else {
            settingsForm.elements[settingName].value = getToolkitSetting(settingName, settingInformation.default);
        }
    }
}

async function saveSettings() {
    for (const [settingName, settingInformation] of Object.entries(toolkitData.settings)) {
        //Get the set value
        var settingValue;
        if (settingInformation.type === "boolean") {
            settingValue = settingsForm.elements[settingName].checked;
        } else {
            settingValue = settingsForm.elements[settingName].value;
        }
        //Check if the user has set a value
        if (settingValue !== settingInformation.default) {
            userToolkitSettings[settingName] = settingValue;//Not the default, save it
        } else {
            delete userToolkitSettings[settingName];//Set as default, remove if present
        }
    }
    return dataManagerInstance.updateUserInformation(["settings", "toolkitSettings"], userToolkitSettings);
}

settingsApplyButton.addEventListener("click", async () => {
    settingsApplyButton.disabled = true;
    saveSettings().then(() => {
        showMarkingSkillScreen(currentMarkingToolkit)
    }).catch((err) => {
        console.log(err);
        alert("Unable to save your settings. Please try again later.");
    }).finally(() => {
        settingsApplyButton.disabled = false;
        dialogContainer.style.display = "none";
    })
})

const saveBroadcastChannel = new BroadcastChannel('TEST_SHEETS/OFFLINE_SAVE_EVENT');
saveBroadcastChannel.onmessage = ((event) => {
    let eventInfo = event.data;
    if (eventInfo.type !== "toolkit") {
        return;
    }
    if (!currentMarkingToolkit) {
        return;
    }
    if (Array.isArray(eventInfo.key) && eventInfo.key.length === 2 && eventInfo.key[0] === currentMarkingToolkit.attachedSheet && eventInfo.key[1] === currentMarkingToolkit.dbKey) {
        //This signal is for the currently displayed toolkit
        setSaveIndicator(SAVE_STATUS.SERVER_SAVED);
    }
})

function hideAllSections() {
    sections.forEach((section) => {
        section.style.display = "none";
    });
}

function hideAllSubbars() {
    subBars.forEach((bar) => {
        bar.style.display = "none";
    })
}

function showSection(section) {
    hideAllSections();
    hideAllSubbars();
    let sectionIndex = sections.indexOf(section);
    section.style.display = "flex";
    subBars[sectionIndex].style.display = "flex";
}

const markingHolder = document.getElementById("markingHolder");
const globalSituationDesigner = document.getElementById("globalSituationDesigner");
function resetMarkingScreen() {
    //Clear
    clearChildren(markingHolder);
    //Reset per-marking/global
    perItemMarkingHolder.style.display = "none";
    clearChildren(perItemMarkingList);
    globalSituationDesigner.style.display = "none";
    clearChildren(globalSituationDesigner);
    //Navigation menu reset
    markingNavigationBackground.classList.add("initial");
    markingNavigationBackground.classList.remove("show");
    markingNavigationBackground.classList.add("hide");
    //Save indicator
    setSaveIndicator(null);
    //Clear messaging channels
    candidateSelectChannel.release();
    perSituationMarkingChannel.release();
    markingChangeChannel.release();
}


window.addEventListener("popstate", async (event) => {
    if (event.state) {
        let navData = event.state;
        console.log(navData)
        switch (navData.page) {
            case "results":
                showResultsScreen();
                break;
            case "marking":
                try {
                    let loadedToolkitEntry;
                    if (navData.saveStatus === SAVE_STATUS.INITIAL) {
                        loadedToolkitEntry = new SkillMarkingEntry(null, sheetContainer.dbKey, navData.skillIdentifier, SAVE_STATUS.INITIAL);
                    } else {
                        loadedToolkitEntry = await dataManagerInstance.getToolkitInstance(navData.key, sheetContainer);
                    }
                    showMarkingSkillScreen(loadedToolkitEntry);
                } catch (err) {
                    //Offline
                    console.log(err);
                    alert("Unable to load");
                }
                break;
            case "skillList":
                showSkillsListScreen();
                break;
        }
    }
})

window.addEventListener("beforeunload", forceSave);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") forceSave();
});