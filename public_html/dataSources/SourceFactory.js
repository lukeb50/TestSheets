class SourceFactory {
    getSourceOfType(type) {
        if (type === "GoogleForms") {
            return new GoogleFormsSource();
        } else if (type === "csv") {
            return new CsvSource();
        } else if (type === "test") {
            return new TestSource();
        }
    }
}