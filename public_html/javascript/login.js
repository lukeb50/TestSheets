const loginHolder = document.getElementById("loginFormHolder");
const signupHolder = document.getElementById("signupFormHolder");
const forgotPasswordHolder = document.getElementById("forgotPasswordFormHolder");
const emailSignupSuccessHolder = document.getElementById("emailSignupSuccessHolder");

const scenes = [loginHolder, signupHolder, forgotPasswordHolder, emailSignupSuccessHolder];

//Login Section
const loginEmailInput = document.getElementById("loginEmailInput");
const loginPasswordInput = document.getElementById("loginPasswordInput");
const loginExecuteButton = document.getElementById("loginExecuteButton");

const loginErrorMessage = document.getElementById("loginErrorMessage");

//oAuth Buttons
const googleOAuthButton = document.getElementById("googleLoginButton");

//Signup Section
const signupEmailInput = document.getElementById("signupEmailInput");
const signupPasswordInput = document.getElementById("signupPasswordInput");
const signupPasswordConfirmInput = document.getElementById("signupPasswordConfirmInput");
const signupExecuteButton = document.getElementById("signupExecuteButton");

const emailRegex = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;

const signupErrorMessage = document.getElementById("signupErrorMessage");

//Forgot Email Section
const forgotEmailInput = document.getElementById("forgotEmailInput");
const forgotExecuteButton = document.getElementById("forgotPasswordExecuteButton");

const forgotErrorMessage = document.getElementById("forgotErrorMessage");

const sceneInputs = [loginEmailInput, loginPasswordInput, signupEmailInput, signupPasswordInput, signupPasswordConfirmInput, forgotEmailInput];
const sceneErrorMessages = [loginErrorMessage, signupErrorMessage, forgotErrorMessage];

//Used by UI for switching views
function setActiveScene(sceneElement) {
    scenes.forEach((scene) => {
        scene.style.display = "none";
    });
    sceneInputs.forEach((inputEl) => {
        inputEl.value = "";
    });
    sceneErrorMessages.forEach((errorEl) => {
        errorEl.style.display = "none";
        errorEl.textContent = "";
    })
    sceneElement.style.display = "block";
}

const app = initFirebase();

function signup() {
    //Local checks
    setErrorMessage();
    if (!emailRegex.test(signupEmailInput.value)) {
        signupErrorMessage.textContent = "Not a valid email"
        return;
    }
    if (signupPasswordInput.value.length === 0) {
        setErrorMessage("No password entered");
        return;
    }
    if (signupPasswordInput.value.length < 6) {
        setErrorMessage("Password too short");
        return;
    }
    if (signupPasswordInput.value !== signupPasswordConfirmInput.value) {
        setErrorMessage("Passwords must match");
        return;
    }
    //Attempt creation
    firebase.auth().createUserWithEmailAndPassword(signupEmailInput.value, signupPasswordInput.value).then((user) => {
        firebase.auth().currentUser.sendEmailVerification().then(() => {
            setActiveScene(emailSignupSuccessHolder);
        }).catch((err) => {
            console.log(err);//Could log in but could not send verification email. Bypass screen.
            redirectAfterLogin();
        })
    }).catch((error) => {
        console.log(error);
        //Handle error codes
        switch (error.code) {
            case "auth/email-already-exists":
                setErrorMessage("An account already exists with this email address");
                break;
            case "auth/internal-error":
                setErrorMessage("An internal error occured, please try again later");
                break;
            case "auth/invalid-email":
                setErrorMessage("Not a valid email");
                break;
            case "auth/password-does-not-meet-requirements":
            case "auth/invalid-password":
                setErrorMessage("Please use a stronger password");
                break;
            default:
                setErrorMessage("An internal error occured, please try again later");
        }
    });

    function setErrorMessage(msg) {
        if (msg) {
            signupErrorMessage.style.display = "block";
            signupErrorMessage.textContent = msg;
        } else {
            signupErrorMessage.style.display = "none";
        }
    }
}

signupExecuteButton.onclick = signup();
document.getElementById("signupForm").addEventListener("submit", (e) => {
    e.preventDefault();
    signup();
});

document.getElementById("emailSignupSuccessGoButton").addEventListener("click", redirectAfterLogin)

function login() {
    //Local checks
    setErrorMessage();
    if (!loginEmailInput.value || !emailRegex.test(loginEmailInput.value)) {
        setErrorMessage("Not a valid email");
        return;
    }
    if (loginPasswordInput.value.length === 0) {
        setErrorMessage("No password entered");
        return;
    }
    if (loginPasswordInput.value.length < 6) {
        setErrorMessage("Password too short");
        return;
    }
    //Login call
    firebase.auth().signInWithEmailAndPassword(loginEmailInput.value, loginPasswordInput.value).then((user) => {
        redirectAfterLogin();
    }).catch((error) => {
        switch (error.code) {
            case "auth/invalid-credential":
                setErrorMessage("Email or password are invalid");
                break;
            case "auth/invalid-email":
                setErrorMessage("Not a valid email");
                break;
            case "auth/internal-error":
                setErrorMessage("An internal error occured, please try again later");
                break;
            case "auth/user-disabled":
                setErrorMessage("Your account has been suspended");
                break;
            default:
                setErrorMessage("An internal error occured, please try again later");
        }
    });
    function setErrorMessage(msg) {
        if (msg) {
            loginErrorMessage.style.display = "block";
            loginErrorMessage.textContent = msg;
        } else {
            loginErrorMessage.style.display = "none";
        }
    }
}

loginExecuteButton.addEventListener("click", login);
document.getElementById("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    login();
});

googleOAuthButton.onclick = function () {
    firebase.auth().useDeviceLanguage();
    var googleProvider = new firebase.auth.GoogleAuthProvider();
    googleProvider.addScope("https://www.googleapis.com/auth/drive.file");
    firebase.auth().signInWithPopup(googleProvider).then((resultCredential) => {
        //Commit the access token to local storage so that it can be used to access Drive
        var googleToken = resultCredential.credential.accessToken;
        new AuthProvider().addCredential(new GoogleFormsSource(), googleToken);
        redirectAfterLogin();
    }).catch((error) => {
        console.log(error);
    })
}

function redirectAfterLogin() {
    windowParams = new URLSearchParams(window.location.search);
    if (windowParams.has("close")) {
        //If opened as a popup, close after login
        window.close();
    } else {
        window.location.href = "home.html"
    }
}

function forgotPassword() {
    //Local checks
    setErrorMessage();
    if (!forgotEmailInput.value || !emailRegex.test(forgotEmailInput.value)) {
        setErrorMessage("Not a valid email");
        return;
    }
    //Firebase call
    firebase.auth().sendPasswordResetEmail(forgotEmailInput.value).then(() => {
        alert("Password reset email sent. Please check your email.");
        setActiveScene(loginHolder);
    }).catch((error) => {
        switch (error.code) {
            case "auth/invalid-email":
                setErrorMessage("Not a valid email");
                break;
            case "auth/internal-error":
                setErrorMessage("An internal error occured, please try again later");
                break;
            default:
                setErrorMessage("An internal error occured, please try again later");
        }
    })
    function setErrorMessage(msg) {
        if (msg) {
            forgotErrorMessage.style.display = "block";
            forgotErrorMessage.textContent = msg;
        } else {
            forgotErrorMessage.style.display = "none";
        }
    }
}

forgotExecuteButton.onclick = forgotPassword();
document.getElementById("forgotPasswordForm").addEventListener("submit", (e) => {
    e.preventDefault();
    forgotPassword();
});