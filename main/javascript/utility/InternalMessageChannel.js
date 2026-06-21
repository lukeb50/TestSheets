class InternalMessageChannel {
    #attachedListeners = [];

    addListeningFunction(fn) {
        this.#attachedListeners.push(fn);
    }

    removeListeningFunction(fn) {
        let index = this.#attachedListeners.indexOf(fn);
        if (index === -1) {
            return null;
        }
        this.#attachedListeners.splice(index, 1);
    }

    release() {
        this.#attachedListeners = [];
    }

    notify(data) {
        this.#attachedListeners.forEach((listenerFn) => {
            listenerFn(data);
        })
    }
}