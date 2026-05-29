class BlankSource extends Source {
    allowEmpty = true;
    //Convert JSON into a ResponseContainer & Return
    getResponseContainer() {
        return super.getResponseContainer();

    }
}