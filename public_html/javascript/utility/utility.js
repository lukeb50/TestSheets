//Shared Modification Functions
var uppercaseWords = function (value) {
    var splitString = value.toString().trim().split(" ");
    if (splitString.length === 0) {
        return value;
    }
    for (var i = 0; i < splitString.length; i++) {
        if (splitString[i].length > 0) {
            splitString[i] = splitString[i].charAt(0).toUpperCase() + splitString[i].substring(1);
        }
    }
    return splitString.join(" ");
};

const jsFieldValueModifications = {
    PostalCode: {
        //Formats a postal code into uppercase with a space
        Formatted: function (value) {
            var matchInfo = value.toUpperCase().match(/(\w{3})[ -]?(\w{3})/);
            if (matchInfo && matchInfo.length >= 3) {
                return matchInfo[1] + " " + matchInfo[2];
            } else {
                return value;
            }
        }
    },
    DOBM: {
        //Converts a written date ("Jan", "October") and returns the corresponding formatted month number (01,10)
        Numeric: function (value) {
            //Check for values that do not need to be formatted (ints)
            if (isNaN(value) || value !== parseInt(value)) {
                //Make a Date object and check if it is value
                let date = new Date(value + " 1 2000");
                if (!isNaN(date.valueOf())) {
                    //Valid date object
                    let monthNum = date.getMonth() + 1;
                    return (monthNum >= 10 ? monthNum : "0" + monthNum).toString();
                }
                //Invalid date object, return empty
                return "";
            } else {
                if (!isNaN(value)) {
                    //An int was provided, pass it through
                    return value;
                }
                return "";
            }
        }
    },
    DOB: {
        //Removes the 20 from a year (ex: 2025-05-12 -> 25-05-12)
        ShortYear: function (value) {
            let regexp = new RegExp("([0-9]{2,4})(-[0-9]{1,2}-[0-9]{1,2})");
            let matchInfo = regexp.exec(value);
            if (matchInfo && matchInfo.length === 3) {
                //If regex matches (4 number year)
                let yearMatch = matchInfo[1];
                return (yearMatch.length === 2 ? yearMatch : yearMatch.substring(2, 4)) + matchInfo[2];
            }
        }
    },
    Name: {
        Uppercase: uppercaseWords
    },
    Address: {
        Uppercase: uppercaseWords
    },
    City: {
        Uppercase: uppercaseWords
    },
    LSSId: {
        UppercaseID: function (value) {
            return value ? value.toUpperCase() : "";
        }
    }
};

const firebaseConfig = {
    apiKey: "AIzaSyA_4KE8cx9n3E6hOV17n8v15bDRuMked6Y",
    authDomain: "test-sheets-451300.firebaseapp.com",
    projectId: "test-sheets-451300",
    storageBucket: "test-sheets-451300.firebasestorage.app",
    messagingSenderId: "812050814842",
    appId: "1:812050814842:web:efc4d287032b60e5ce68c3"
};

function initFirebase() {
    return firebase.initializeApp(firebaseConfig);
}

function logoutUser() {
    firebase.auth().signOut();
    sessionStorage.clear();
}

function getRemoteFirebaseFunctions() {
    var fns = app.functions("northamerica-northeast1");
    fns.useEmulator("127.0.0.1", 5001);
    return fns;
}

function awaitUserLoad() {
    return new Promise((resolve, reject) => {
        var user = firebase.auth().currentUser;
        if (user) {
            resolve(user);
        }
        var unsubFn = firebase.auth().onAuthStateChanged(user => {
            if (user) {
                unsubFn();
                resolve(user);
            }
            else {
                unsubFn();
                reject();
            }
        })
    })
}

var connectionManager;
function getConnectionManager() {
    if (!connectionManager) {
        connectionManager = new ConnectionManager(new FirebaseFunctionsConnection(getRemoteFirebaseFunctions()));
    }
    return connectionManager;
}

const dataUrls = { fields: '../data/fieldDataFile.json', sheets: '../data/sheetDataFile.json' };
const dataFileNames = { fields: "fields", sheets: "sheets" }

Object.freeze(dataUrls);
Object.freeze(dataFileNames);

async function loadJsonFiles(...filesToLoad) {
    var promises = [];
    filesToLoad.forEach(fileName => {
        promises.push(fetch(dataUrls[fileName]));
    });
    return Promise.all(promises).then((values) => {
        return Promise.all(values.map((response) => response.json())).then((jsonValues) => {
            var response = {};
            filesToLoad.forEach((fileName, index) => {
                response[fileName] = jsonValues[index];
            });
            return response;//{fields: jsonValues[0], sheets: jsonValues[1]};
        });
    });
}

function hideAllChildren(el) {
    for (const child of el.children) {
        child.style.display = "none";
    }
}

function clearChildren(el) {
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
}

function createElement(type, appendTo, textContent, classNames) {
    var el = document.createElement(type);
    appendTo.appendChild(el);
    if (textContent) {
        el.textContent = textContent;
    }
    if (classNames) {
        el.className = classNames;
    }
    return el;
}