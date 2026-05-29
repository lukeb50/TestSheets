/* global customElements */

class MultiSelect extends HTMLElement {
    shadow;
    listContainer;
    mainListElement;
    selectionDisplay;

    #value;

    interactFlag = false;

    constructor() {
        try {
            super();
            this.valueTexts = [];
            this.options = [];
            this.#value = [];
            this.shadow = this.attachShadow({ mode: "open" });
            let link = document.createElement('link');
            link.setAttribute('rel', 'stylesheet');
            link.setAttribute('href', '../customElements/multiSelect.css');
            this.shadow.appendChild(link);
            let selectionDiv = createElement("div", this.shadow, "",);
            selectionDiv.id = "selection"
            selectionDiv.part = "bar";
            this.selectionDisplay = createElement("label", selectionDiv);
            this.listContainer = createElement("div", this.shadow, "", "scrollbar");
            this.listContainer.id = "listContainer";
            this.listContainer.style.display = "none";
            this.mainListElement = createElement("div", this.listContainer, "", "");
            this.mainListElement.id = "list";
            //Handle events
            this.addEventListener("focusin", this.#handleFocused);
            this.addEventListener("focusout", this.#handleUnfocused);
            //Initial render
            this.#renderSelected();
        } catch (err) {
            console.log(err);
        }
    }

    connectedCallback() {
        this.tabIndex = 0;
    }

    attachScroll(scrollingParent) {
        scrollingParent.addEventListener('scroll', () => {
            let boundingRect = this.getBoundingClientRect();
            this.listContainer.style.top = boundingRect.bottom + "px";
            this.listContainer.style.maxHeight = `${window.innerHeight - boundingRect.bottom - 5}px`;
        });
    }

    #handleFocused() {
        this.listContainer.style.display = "block";
        let boundingRect = this.getBoundingClientRect();
        this.listContainer.style.width = boundingRect.width + "px";
        this.listContainer.style.maxHeight = `${window.innerHeight - boundingRect.bottom - 5}px`;
    }

    #handleUnfocused(e) {
        this.listContainer.style.display = "none";
    }

    set value(newValueTmp) {
        var newValueTexts = [];
        var newValue = [];
        //Go through each option
        this.options.forEach(entry => {
            //Check if it's a section
            if (entry['content']) {
                entry['content'].forEach((catEntry) => {
                    processEntry(catEntry, this.listContainer);
                })
            } else {
                processEntry(entry, this.listContainer);
            }
        });
        //Set values
        this.valueTexts = newValueTexts;
        this.#value = newValue;
        //Render selection bar
        this.#renderSelected();

        function processEntry(entry, listContainer) {
            let checkbox = listContainer.querySelector(`input[type="checkbox"][data-value="${entry.value}"]`);
            //set each checkbox
            checkbox.checked = newValueTmp.includes(entry.value);
            //Ensure valueTexts and value are mirrored
            if (newValueTmp.includes(entry.value)) {
                newValueTexts.push(entry.name);
                newValue.push(entry.value);
            }
        }
    }

    setNegativeValue(negativeValue) {
        let positiveEntries = [];
        this.options.forEach(entry => {
            //Check if it's a section
            if (entry['content']) {
                entry['content'].forEach((catEntry) => {
                    if (!negativeValue.includes(catEntry.value)) {
                        positiveEntries.push(catEntry.value);
                    }
                })
            } else {
                if (!negativeValue.includes(entry.value)) {
                    positiveEntries.push(catEntry.value);
                }
            }
        });
        this.value = positiveEntries;
    }

    //getter: allows multiSelect.value to return internal state
    get value() {
        return this.#value;
    }

    getNegativeValue() {
        let allEntries = [];
        this.options.forEach(entry => {
            //Check if it's a section
            if (entry['content']) {
                entry['content'].forEach((catEntry) => {
                    allEntries.push(catEntry.value);

                })
            } else {
                allEntries.push(catEntry.value);
            }
        });
        return allEntries.filter((val) => !this.value.includes(val));
    }

    #renderSelected() {
        clearChildren(this.selectionDisplay);
        //Calculate ordering
        if (this.#value.length === 0) {
            this.selectionDisplay.textContent = "No Selection";
        } else {
            //Array with the correct order for each value
            var orderingTable = this.options.reduce(reducerfn, []);
            //Combine so that value: name pairs are preserved after sort
            let combinedToSort = this.#value.map((val, i) => [val, this.valueTexts[i]]);
            combinedToSort.sort((a, b) => orderingTable.indexOf(a[0]) - orderingTable.indexOf(b[0]));
            let sortedTexts = combinedToSort.map((entry) => entry[1]);
            this.selectionDisplay.textContent = sortedTexts.join(", ");
        }

        function reducerfn(acc, currentEntry) {
            if (currentEntry['value']) {
                acc.push(currentEntry['value']);
                return acc;
            } else {
                return [...acc, ...currentEntry['content'].reduce(reducerfn, [])];
            }
        }
    }

    #renderList() {
        clearChildren(this.mainListElement);
        this.options.forEach(entry => {
            //Check if it's a section
            if (entry['content']) {
                createElement("label", this.mainListElement, entry['name'], "heading");
                entry['content'].forEach((entry) => {
                    this.#createEntry(entry, this.mainListElement);
                })
            } else {
                this.#createEntry(entry, this.mainListElement);
            }
        });
    }

    #createEntry({ name, value }, appendTo) {
        //type, appendTo, textContent, classNames
        let span = createElement("span", appendTo, "", "listEntry");
        let lbl = createElement("label", span, name);
        lbl.addEventListener("keydown", this.#attachInputKeyboard);
        let inputEl = createElement("input", lbl);
        inputEl.type = "checkbox";
        inputEl.setAttribute("data-value", value);
        inputEl.setAttribute("data-name", name);
        inputEl.addEventListener("change", this.#handleInputChange.bind(this));
    }

    #attachInputKeyboard(e) {
        if (e.keyCode === 13 && e.target.tagName === "INPUT") {
            e.target.checked = !e.target.checked;
            e.target.dispatchEvent(new Event("change", { bubbles: true }))
        }
    }

    #handleInputChange(e) {
        var val = e.target.getAttribute("data-value");
        var txt = e.target.getAttribute("data-name");
        var isAdd = e.target.checked;
        if (isAdd) {
            this.#value.push(val);
            this.valueTexts.push(txt);
        } else {
            let index = this.#value.indexOf(val);
            if (index === -1) {
                //Should not happen
                return;
            }
            this.valueTexts.splice(index, 1)
            this.#value.splice(index, 1);
        }
        this.#renderSelected();
        this.dispatchEvent(new Event("change", { bubbles: true }));
    }

    setOptions(options = []) {
        if (!options) {
            this.options = [];
            this.#value = [];
            this.valueTexts = [];
            this.#renderSelected();
            this.#renderList();
            return;
        }
        this.options = options;
        this.#renderSelected();
        this.#renderList();
    }
}

customElements.define('multi-select', MultiSelect);