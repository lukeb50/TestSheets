class CombinedResultInput extends HTMLElement {
    shadow;
    #adapter;

    constructor() {
        super()
        this.shadow = this.attachShadow({ mode: "open" });
    }

    static get observedAttributes() {
        return ["type"];
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal) {
            return;
        }
        this.#adapter = null;
        this.shadow.innerHTML = "";
        this.setupType(newVal);
    }

    connectedCallback() {
        if (this.hasAttribute("type")) {
            //this.setupType(this.getAttribute("type"));
        }
    }

    setupType(type) {
        //Build correct input
        this.createStylesheet();
        switch (type) {
            case "segmented":
                var fragment = document.getElementById("skillSegmentedSelect").content.cloneNode(true);
                let complexInput = fragment.firstElementChild;
                this.shadow.appendChild(fragment);
                this.#adapter = new TripleSegmentedAdapter(complexInput, this.valueUpdateCallback);
                break;
            case "positive":
            case "negative":
                var checkboxInput = createElement("input", this.shadow, null, "markingCheckbox");
                checkboxInput.type = "checkbox";
                this.#adapter = new CheckboxAdapter(checkboxInput, this.valueUpdateCallback, type === "positive");
                break;
            default:
                throw new Error("Invalid type");
        }
        //Reflect any values
        if (this.hasAttribute("value")) {
            let mapping = { "true": true, "false": false, "null": null };
            this.#adapter.setValue(mapping[this.getAttribute("value")] ?? null);
        }
    }

    createStylesheet() {
        let link = document.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('href', '../customElements/combinedResultInput.css');
        this.shadow.appendChild(link);
        link = document.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('href', '../stylesheets/root.css');
        this.shadow.appendChild(link);
    }

    valueUpdateCallback = () => {//Receives changes from the nested element/adapter and propagates them to the main DOM element
        this.dispatchEvent(new Event("change"));
        this.setAttribute("val", this.value);
    }

    toggle() {
        this.#adapter.toggle();
    }

    set value(newVal) {
        this.#adapter.setValue(newVal);
        this.setAttribute("val", newVal);
    }

    get value() {
        return this.#adapter.getValue();
    }
}

class DefaultAdapter {
    _element;
    _valueUpdateListener;
    constructor(element, changeListener) {
        this._element = element;
        this._valueUpdateListener = changeListener;
        element.addEventListener("change", changeListener);
    }

    getValue() {
        return this._element.value;
    }

    setValue(newVal) {
        this._element.value = newVal;
    }

    toggle() {

    }
}

class TripleSegmentedAdapter extends DefaultAdapter {
    valueMap = { "pass": true, "fail": false, "": null }
    constructor(element, changeListener) {
        super(element, changeListener);
    }

    getValue() {
        return this.valueMap[this._element.value]
    }

    setValue(newVal) {
        this._element.value = Object.entries(this.valueMap).find(([_, value]) => value === newVal)[0];
    }
}

class CheckboxAdapter extends DefaultAdapter {
    mode; //Sets what the 'checked' value is. I.e. mode=false, checking will show an X
    constructor(element, changeListener, mode = true) {
        super(element, changeListener);
        this.mode = mode;
        //Tag element for negative visual if needed
        if (mode === false) {
            element.classList.add("negativeMarking");
        }
        //Listen for clicks
        element.addEventListener("click", function (e) {
            //If showing an opposite shadow, a click should clear the box to null, and the shadow cleared
            if (element.classList.contains("oppositeShadow")) {
                e.preventDefault();//Prevent the checkbox from changing into the DOM checked state
                element.checked = false;
                element.classList.remove("oppositeShadow");
                this._valueUpdateListener();//Let the top-level element know
            }
        }.bind(this))
    }

    getValue() {
        if (this._element.classList.contains("oppositeShadow")) {
            return !this.mode;//Showing an opposite shadow, so the acutal value is the opposite of the mode
        } else if (this._element.checked) {
            return this.mode;//Checked with no opposite shadow, value is the mode
        } else {
            return null; //Unchecked, return null
        }
    }

    setValue(newVal) {
        if (newVal == null) {//null
            this._element.checked = false;
        } else if (newVal == this.mode) {//setting to what mode is, so check the box
            this._element.checked = true;
            this._element.classList.remove("oppositeShadow");
        } else {//Setting to opposite of mode, decheck and add opposite shadow
            this._element.checked = false;
            this._element.classList.add("oppositeShadow");
        }
    }

    toggle() {
        this._element.click();
    }
}
customElements.define('result-input', CombinedResultInput);