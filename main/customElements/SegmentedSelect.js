class SegmentedSelect extends HTMLElement {
    shadow;
    container;
    #value = "";
    constructor() {
        super();
        this._upgradeProperty("value");
        //Setup
        this.shadow = this.attachShadow({ mode: "open" });
        let link = document.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('href', '../customElements/segmentedSelect.css');
        this.shadow.appendChild(link);
        this.container = createElement("div", this.shadow, "", "segmentContainer");
    }

    _upgradeProperty(prop) {
        if (this.hasOwnProperty(prop)) {
            const value = this[prop];
            delete this[prop];
            this[prop] = value;
        }
    }

    connectedCallback() {
        for (const [i, opt] of this.querySelectorAll("option").entries()) {
            let optionBtn = createElement("button", this.container, null, "segmentOption");
            optionBtn.innerHTML = opt.innerHTML;
            //Select the first option
            if (i === 0 && (this.#value === undefined || this.#value === null || !this.#value)) {
                this.#value = opt.value;
                optionBtn.classList.add("selected");
            } else if (opt.value == this.#value) {//Or the pre-set value if present
                optionBtn.classList.add("selected");
            }
            //set the value on the option
            optionBtn.setAttribute("data-value", opt.value);
            //Check if the color has been set, or use a default gray
            let baseColor;
            if (opt.hasAttribute("data-color")) {
                baseColor = opt.getAttribute("data-color");
            } else {
                baseColor = "100 100 100";
            }
            optionBtn.style.setProperty("--color", baseColor);
            //If the user has set a seperate active color (hover/selected), apply it, otherwise use the baseColor
            if (opt.hasAttribute("data-active-color")) {
                optionBtn.style.setProperty("--active-color", opt.getAttribute("data-active-color"));
            } else {
                optionBtn.style.setProperty("--active-color", baseColor);
            }
            //Attach click
            optionBtn.addEventListener("click", onClick.bind(this));
        };

        function onClick(e) {
            let selected = e.target.closest("button");
            this.container.querySelectorAll("button.segmentOption").forEach((optBtn) => {
                optBtn.classList.remove("selected");
            });
            selected.classList.add("selected");
            this.#value = selected.getAttribute("data-value");
            this.dispatchEvent(new Event("change"));
        }
    }

    //value is held internally, attach getter/setter
    get value() {
        return this.#value;
    }

    set value(newValue) {
        this.#value = newValue;//Set
        if (!this.container) {
            return;
        }
        //Clear selected
        this.container.querySelectorAll("button.segmentOption").forEach((optBtn) => {
            optBtn.classList.remove("selected");
        });
        //Set selected
        this.container.querySelector(`button[data-value='${newValue}']`)?.classList.add("selected");
    }
}

customElements.define('segmented-select', SegmentedSelect);