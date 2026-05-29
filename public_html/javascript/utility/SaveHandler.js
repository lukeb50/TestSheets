var changePending = false;

var changeTimeout;//resets after each change
var safetyTimeout;//prevents too many changes from reseting changetimout and never actually saving.

var saveExecuteFn;

var onSaveSuccess;
var onSaveFail;
var onSaveStart;
var onChange;

const backoffScaler = 1.25;
const initialBackoff = 10000;
const maxBackoff = 60000;

var currentBackoff = initialBackoff;

var allowSave = (() => {
    return true;
});

function markChange() {
    if (changeTimeout) {
        clearTimeout(changeTimeout);
    }
    changeTimeout = setTimeout(executeSave, 5000);
    if (!safetyTimeout) {
        safetyTimeout = setTimeout(executeSave, 30000);
    }
    changePending = true;
    if (onChange) {
        onChange();
    } else {
        return true;
    }
}

async function forceSave() {
    return await executeSave();
}

async function executeSave() {
    if (changeTimeout) {
        clearTimeout(changeTimeout);
        changeTimeout = null;
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
        var result = await saveExecuteFn();
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