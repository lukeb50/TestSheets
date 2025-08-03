//Stores authentication credentials to avoid re-prompting
class AuthProvider{
    authSources = {};
    
    addCredential(context, credentials){
        this.authSources[context.constructor.name] = credentials;
    }
    
    getCredential(context){
        let credentials = this.authSources[context.constructor.name];
        return credentials;
    }
    
    hasCredential(context){
        return Object.hasOwn(this.authSources,context.constructor.name);
    }
    
    clearCredential(context){
        delete this.authSources[context.constructor.name];
    }
}