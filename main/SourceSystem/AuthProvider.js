//Stores authentication credentials to avoid re-prompting
class AuthProvider {
    authSources = {};

    //Adds a gotten credential
    addCredential(context, credentials) {
        this.authSources[this.getContextName(context)] = credentials;
        sessionStorage.setItem(this.getContextName(context), credentials);
    }

    getCredential(context) {
        this.loadCredential(context);//See if another page has supplied a credential
        let credentials = this.authSources[this.getContextName(context)];
        return credentials;
    }

    hasCredential(context) {
        this.loadCredential(context);//See if another page has supplied a credential
        return Object.hasOwn(this.authSources, this.getContextName(context));
    }

    clearCredential(context) {
        delete this.authSources[this.getContextName(context)];
        sessionStorage.removeItem(this.getContextName(context));
    }

    loadCredential(context) {
        let cred = sessionStorage.getItem(this.getContextName(context));
        if (cred) {
            this.addCredential(context, cred);
        }
    }

    getContextName(context) {
        return context.constructor.name;
    }
}