var sheetData;

const app = initFirebase();

const dataManagerInstance = new DataManager(getConnectionManager());

//authentication handler
firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
        redirectToCreate();
    }
});

window.onload = function () {
    renderSkeletons();
    //Load JSON files
    loadJsonFiles(dataFileNames.sheets).then(async (data) => {
        sheetData = data[dataFileNames.sheets];
        await awaitUserLoad();
        loadSheetSummaryInfo();
    }).catch((e) => {
        alert("Internal error. Please try again later");
        console.log(e);
    });
};

document.getElementById("signOutButton").onclick = function () {
    logoutUser();
}

function redirectToCreate() {
    window.location.href = "create.html"
}

function redirectToSheet(sheetId) {
    var sheetUrl = new URL("sheet.html", window.location.href);
    sheetUrl.searchParams.set("id", sheetId);
    window.location.href = sheetUrl.toString();
}

async function loadSheetSummaryInfo() {
    var data;
    var userInfo;
    try {
        data = await dataManagerInstance.getSheetSummary();
        userInfo = await dataManagerInstance.getUserInformation();
    } catch (err) {
        return;
    }
    renderSheetList(data, userInfo);
};

const mainListHolder = document.getElementById("homeMainList");
const cardTemplate = document.getElementById("cardTemplate");
const newSheetCardTemplate = document.getElementById("newSheetCardTemplate");

function renderSkeletons() {
    const listStyleColumns = getComputedStyle(mainListHolder).gridTemplateColumns.split(" ");
    const numberOfSkeletons = listStyleColumns.length;
    clearChildren(mainListHolder);
    for (let i = 0; i < numberOfSkeletons; i++) {
        var sheetCardFragment = cardTemplate.content.cloneNode(true);
        var sheetCard = sheetCardFragment.firstElementChild;
        mainListHolder.appendChild(sheetCardFragment);
        //Set Values
        sheetCard.classList.add("skeleton-container");
        for (button of sheetCard.querySelectorAll("button")) {
            button.disabled = true;
            button.textContent = "";
        }
        for (inputEl of sheetCard.querySelectorAll("input")) {
            inputEl.disabled = true;
            inputEl.placeholder = "";
        }
    }
}

function renderSheetList(data, userInfo) {
    clearChildren(mainListHolder);
    for (const [sheetKey, sheetEntry] of Object.entries(data)) {
        //Append
        var sheetCardFragment = cardTemplate.content.cloneNode(true);
        var sheetCard = sheetCardFragment.firstElementChild;
        mainListHolder.appendChild(sheetCardFragment);
        //Get category & sheet information
        var sheetInfo = Object.entries(sheetData)
            .flatMap(([categoryName, categoryContentArray]) => categoryContentArray)
            .find(entry => entry.identifier === sheetEntry.sheetId);
        var categoryName = Object.entries(sheetData).find(([key, value]) => value.some((entry) => entry.identifier === sheetEntry.sheetId))?.[0];
        //Set Text & Color
        sheetCard.style.setProperty("--card-color", `var(--${categoryName},black)`);
        sheetCard.querySelector(".cardTitleText").textContent = sheetInfo.shortform;
        sheetCard.querySelector(".cardTitleDescriptor").textContent = sheetInfo.descriptionText;
        //Set sorting data
        sheetCard.dataset.createdAt = sheetEntry.createdAt;
        sheetCard.dataset.modifiedAt = sheetEntry.modifiedAt;
        sheetCard.dataset.sheetId = sheetEntry.sheetId;
        //Input
        var labelInput = sheetCard.querySelector("input.cardLabelInput");
        labelInput.value = sheetEntry.label;
        labelInput.addEventListener("change", (e) => {
            var currentInput = e.target;
            let newLabelValue = currentInput.value;
            dataManagerInstance.setSheetLabel(sheetKey, newLabelValue);
            sheetEntry.label = newLabelValue;
        });
        //Buttons
        sheetCard.querySelector("button.cardToolkit").disabled = true;
        sheetCard.querySelector("button.cardDelete").addEventListener("click", async (e) => {
            var btn = e.target;
            if (!confirm(`Delete ${sheetEntry.label}? This cannot be undone.`)) {
                return;
            }
            try {
                btn.disabled = true;
                await dataManagerInstance.deleteSheet(sheetKey);
                delete data[sheetKey];
                btn.parentNode.parentNode.remove();
            } catch (err) {
                console.log(err);
                btn.disabled = false;
                alert("Error deleting sheet. Please try again later");
            }
        });
        sheetCard.querySelector("button.cardView").addEventListener("click", async () => {
            redirectToSheet(sheetKey);
        });
    };
    //New Sheet Button
    var newSheetCardFragment = newSheetCardTemplate.content.cloneNode(true);
    var newSheetButtonCard = newSheetCardFragment.firstElementChild;
    newSheetButtonCard.style.order = Number.MAX_SAFE_INTEGER;
    mainListHolder.appendChild(newSheetCardFragment);
    if (Object.keys(data).length < parseInt(userInfo.documentLimit)) {
        //User can still save sheets, remove warning
        newSheetButtonCard.querySelector("p.cardMaxSavesWarning").remove();
    }
    runSort("modified-at");
}

function runSort(sortMethod) {
    console.log("sort");
    switch (sortMethod) {
        case "modified-at":
            handleBasicSort(sortMethod);
            break;
        case "created-at":
            handleBasicSort(sortMethod);
            break;
        case "course":
            var categoryOrdering = Object.values(sheetData).flatMap((category) => category.flatMap((entry) => entry.identifier));
            for (const card of mainListHolder.children) {
                if (card.classList.contains("newSheetCard")) {
                    card.style.order = Number.MAX_SAFE_INTEGER;
                    continue;
                }
                card.style.order = categoryOrdering.indexOf(card.dataset.sheetId);
            }
            break;
    }

    function handleBasicSort(sortMethod) {
        var values = [];
        for (const card of mainListHolder.children) {
            values.push(parseInt(card.getAttribute(`data-${sortMethod}`)));
        }
        values.sort((a, b) => b - a);
        for (const card of mainListHolder.children) {
            if (card.classList.contains("newSheetCard")) {
                card.style.order = Number.MAX_SAFE_INTEGER;
                continue;
            }
            card.style.order = values.indexOf(parseInt(card.getAttribute(`data-${sortMethod}`)));
        }
    }
}

const sortSelector = document.getElementById("sortSelect");
sortSelector.addEventListener("change", function () {
    runSort(sortSelector.value);
});