class SourceFactory {
    getSourceOfType(type) {
        switch (type) {
            case "GoogleForms":
                return new GoogleFormsSource();
                break;
            case "csv":
                return new CsvSource();
                break;
            case "blank":
                return new BlankSource();
                break;
            case "test":
                return new TestSource();
                break;
        }
    }
}