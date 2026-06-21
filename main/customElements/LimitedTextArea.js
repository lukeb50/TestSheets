class LimitedTextArea extends HTMLElement {
    #shadow;
    #textarea;
    #label;

    maxCharacterCount = 0;

    constructor() {
        try {
            super();
            this.#shadow = this.attachShadow({ mode: "open" });
            let link = document.createElement('link');
            link.setAttribute('rel', 'stylesheet');
            link.setAttribute('href', '../customElements/limitedTextArea.css');
            this.#shadow.appendChild(link);
            this.#textarea = createElement("textarea", this.#shadow, null, null);
            this.#textarea.addEventListener("input", this.#handleTyping.bind(this));
            this.#label = createElement("p", this.#shadow, null, null);
            this.setMaxCharacterCount(this.maxCharacterCount);
        } catch (err) {
            console.log(err);
        }
    }

    static get observedAttributes() {
        return ["value", "disabled"];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        console.log("attr",name)
        if (name === "value") {
            this.value = newValue;
        } else if (name === "disabled") {
            this.#updateDisabledState(newValue);
        }
    }

    connectedCallback() {
        if (this.hasAttribute("value")) {
            this.value = this.getAttribute("value");
        }
        if (this.hasAttribute("disabled")) {
            this.#updateDisabledState(this.getAttribute("disabled"));
        }
    }

    #updateDisabledState(disabled) {
        this.#textarea.disabled = disabled;
        this.tabIndex = disabled ? -1 : 0;
    }

    #handleTyping() {
        this.#updateLabel();
        this.dispatchEvent(new Event("change", { bubbles: true }))
    }

    #updateLabel() {
        this.#label.textContent = `${this.#textarea.value.length}/${this.maxCharacterCount}`;
        let factionUsed = this.#textarea.value.length / this.maxCharacterCount;
        this.#label.className = "";
        if (factionUsed >= 0.9) {
            this.#label.className = "warning";
        }
        if (factionUsed >= 1) {
            this.#label.className = "limit";
        }
    }

    setMaxCharacterCount(newVal) {
        this.maxCharacterCount = newVal;
        this.#textarea.maxLength = newVal;
        this.#updateLabel();
    }

    set disabled(newVal){
        this.#updateDisabledState(newVal)
    }

    get value() {
        return this.#textarea.value;
    }

    set value(newVal) {
        this.#textarea.value = newVal;
        this.#updateLabel();
    }
}


customElements.define('limited-textarea', LimitedTextArea);