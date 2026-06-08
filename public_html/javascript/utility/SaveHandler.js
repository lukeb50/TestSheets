var changePending = false;

var localChangeTimeoutRef;//resets after each change
var serverChangeTimeoutRef;//resets after each change
var safetyTimeout;//prevents too many changes from reseting changetimout and never actually saving.

var saveExecuteFn;

var onSaveSuccess;
var onSaveFail;
var onSaveStart;
var onChange;

const backoffScaler = 1.25;
const initialBackoff = 10000;
const maxBackoff = 60000;

const localDebounceTimeout = 500;
const serverDebounceTimeout = 5000;
const safetyDebounceTimeout = 15000;

var currentBackoff = initialBackoff;

var allowSave = (() => {
    return true;
});

function markChange() {
    if (serverChangeTimeoutRef) {
        clearTimeout(serverChangeTimeoutRef);
    }
    if (localChangeTimeoutRef) {
        clearTimeout(localChangeTimeoutRef);
    }
    localChangeTimeoutRef = setTimeout(executeLocalUpdate, localDebounceTimeout);
    serverChangeTimeoutRef = setTimeout(executeSave, serverDebounceTimeout);
    if (!safetyTimeout) {
        safetyTimeout = setTimeout(executeSave, safetyDebounceTimeout);
    }
    changePending = true;
    if (onChange) {
        onChange();
    } else {
        return true;
    }
}

function interuptSaving() {
    clearTimeout(localChangeTimeoutRef);
    localChangeTimeoutRef = null;
    clearTimeout(serverChangeTimeoutRef);
    serverChangeTimeoutRef = null;
    clearTimeout(safetyTimeout);
    safetyTimeout = null;
    changePending = false;
}

async function executeLocalUpdate() {
    if (allowSave()) {
        return await saveExecuteFn(SAVE_MODE.LOCAL);
    }
}

async function forceSave() {
    return await executeSave();
}

async function executeSave() {
    if (serverChangeTimeoutRef) {
        clearTimeout(serverChangeTimeoutRef);
        serverChangeTimeoutRef = null;
    }
    if (safetyTimeout) {
        clearTimeout(safetyTimeout);
        safetyTimeout = null;
    }
    if (!allowSave()) {
        return;
    }
    if (!changePending) {
        return;
    }
    try {
        if (onSaveStart) {
            onSaveStart();
        }
        var result = await saveExecuteFn(SAVE_MODE.SERVER);
        changePending = false;
        if (onSaveSuccess) {
            onSaveSuccess();
        }
        currentBackoff = initialBackoff;
        return result;
    }
    catch (err) {
        console.warn(err);
        if (safetyTimeout) {
            clearTimeout(safetyTimeout);
            safetyTimeout = null;
        }
        safetyTimeout = setTimeout(executeSave, currentBackoff);
        currentBackoff = currentBackoff * backoffScaler <= maxBackoff ? currentBackoff * backoffScaler : maxBackoff;
        if (onSaveFail) {
            onSaveFail();
        }
        throw err;
    }
}