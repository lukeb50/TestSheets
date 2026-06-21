//Authentication
const authProvider = new AuthProvider();
// Initialize Firebase
const app = initFirebase();

SOURCE_CATEGORIES = { ONLINE: "online", FILE: "file", EMPTY: "empty", DEBUG: "debug" }

const sourceButtonHolder = document.getElementById("sourceDialogListing");

//Source select buttons
const googleFormsSourceBtn = document.getElementById("googleFormsSource");
const csvSourceBtn = document.getElementById("csvSource");
const blankSourceBtn = document.getElementById("blankSource");
const testSourceBtn = document.getElementById("testSource");
//Source seconday pages
const googleFormsInputPage = document.getElementById("GoogleFormsInputPage");
const csvInputPage = document.getElementById("csvInputPage");
const blankInputPage = document.getElementById("blankInputPage");
const testInputPage = document.getElementById("testInputPage");
const sourceOptions = [
    { sourceName: "GoogleForms", button: googleFormsSourceBtn, inputPage: googleFormsInputPage, categories: new Set([SOURCE_CATEGORIES.ONLINE]) },
    { sourceName: "csv", button: csvSourceBtn, inputPage: csvInputPage, categories: new Set([SOURCE_CATEGORIES.FILE]) },
    { sourceName: "blank", button: blankSourceBtn, inputPage: blankInputPage, categories: new Set([SOURCE_CATEGORIES.EMPTY]) },
    { sourceName: "test", button: testSourceBtn, inputPage: testInputPage, categories: new Set([SOURCE_CATEGORIES.DEBUG]) }
];
const sourceDialogPages = document.getElementById("sourceDialogSwipeDiv");

function getDataFromSource(selectedSheet, categoriesToShow = new Set()) {
    categoriesToShow = new Set(categoriesToShow);
    //Handle showing the selected buttons
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "") {
        categoriesToShow.add(SOURCE_CATEGORIES.DEBUG);
    }
    for (const child of sourceButtonHolder.children) {
        child.classList.add("hidden");
    }
    sourceOptions.forEach((source) => {
        //If there is at least 1 overlap between the categories the source belongs to and the categories requested
        if (categoriesToShow.intersection(source.categories).size > 0) {
            source.button.classList.remove("hidden");
        }
    })

    //Reset UI & start promise
    sourceDialogPages.style.right = "0%";
    return new Promise((resolve, reject) => {
        sourceOptions.forEach((entry) => {
            bindSourceClick(entry);
        });
        function bindSourceClick(sourceData) {
            sourceData.button.onclick = function () {
                let sourceObject = new SourceFactory().getSourceOfType(sourceData.sourceName);
                sourceObject.setAuthenticationProvider(authProvider);
                sourceObject.execute(true).then((rawSourceObject) => {
                    //Send back to caller
                    resolve({ rawData: rawSourceObject, source: sourceObject });
                }).catch((e) => {
                    alert("Error: " + e);
                    reject(e);
                });
                sourceOptions.forEach((entry) => {
                    entry.inputPage.style.display = "none";
                });
                sourceData.inputPage.style.display = "block";
                sourceDialogPages.style.right = "100%";
            };
        }
    });
}

const csvUpload = document.getElementById("csvUpload");
const csvLabel = document.getElementById("csvFilePickerFileName");
const csvConfirmBtn = document.getElementById("csvConfirmButton");

csvUpload.onchange = function () {
    let files = csvUpload.files;
    if (files.length === 1) {
        //1 File
        csvLabel.textContent = files[0].name;
        const regex = /^([a-zA-Z0-9\s_\\.\-\(\):])+(.csv)$/;
        if (regex.test(files[0].name)) {
            csvUpload.setAttribute("data-valid", true);
            csvConfirmBtn.disabled = false;
        } else {
            csvUpload.setAttribute("data-valid", false);
            csvConfirmBtn.disabled = true;
        }
    } else if (files.length === 0) {
        //No files
        csvLabel.textContent = "No file selected";
        csvUpload.setAttribute("data-valid", false);
        csvConfirmBtn.disabled = true;
    } else {
        csvLabel.textContent = "Invalid Selection";
        csvUpload.setAttribute("data-valid", false);
        csvConfirmBtn.disabled = true;
    }
};