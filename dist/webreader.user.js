// ==UserScript==
// @name         Do Not Clock In
// @namespace    https://b-fuze.dev/
// @version      0.1.7
// @description  Reminder to not clock in
// @author       b-fuze
// @match        https://selfservice.hprod.onehcm.usg.edu/psc/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /**
     * Lists elements which are to be waited on before removal. See `attributeNamespaces/destiny.js` for details (`destiny:out`).
     */
    const deferredElements = new Map();

    const propToWatcherMap = {
        value: "input",
        checked: "change",
        valueAsDate: "input",
        valueAsNumber: "input",
    };
    /**
     * Figures out if and what event listener needs to be attached to a DOM element based on the name of an attribute.
     * @param attributeName the attribute name to be used for determining the event listener type
     */
    function matchChangeWatcher(attributeName) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        return propToWatcherMap[attributeName] ?? "";
    }

    function doOrBind(element, key, value, whatToDo) {
        if (value instanceof ReactivePrimitive) {
            const changeWatcher = matchChangeWatcher(key);
            if (changeWatcher) {
                element.addEventListener(changeWatcher, e => {
                    // Sets the value whilst excluding itself of callbacks to call after the change
                    value.set(e.currentTarget?.[key], whatToDo);
                });
            }
            value.bind(whatToDo);
        }
        else {
            whatToDo(value);
        }
    }

    /**
     * Handler for normal non-namespaced attributes. Behaves like normal HTML.
     *
     * Example usage:
     * ```html
     * <div style="color: red;">I'm red!</div>
     * <!-- adds a style attribute to the element like you'd expect. -->
     * ```
     */
    function attribute(attributes, element) {
        for (const [key, value] of attributes) {
            doOrBind(element, key, value, value => element.setAttribute(key, String(value)));
        }
    }

    /**
     * `destiny:out` takes a callback function which will be called
     * when the element is about to be removed from DOM. If the
     * callback returns a promise, that promise will be awaited on
     * and the element is removed once it resolves.
     *
     * Example usage:
     * ```html
     * <div destiny:in=${
     *   element => {
     *     const anim = element.animate(
     *       [{opacity: 0}, {height: 1}],
     *       {duration: 300, fill: "forwards"},
     *     );
     *     anim.play();
     *     return anim.finished; // Element is removed once the animation finishes
     *   }
     * }> This will fade out! </div>
     * ```
     */
    function destinyOut(element, value) {
        deferredElements.set(element, value);
    }

    /**
     * `destiny:in` takes a callback function, which will be called
     * once the element has been created.
     *
     * Example usage:
     * ```html
     * <div destiny:in=${
     *   element => element.animate(
     *     [{opacity: 0}, {height: 1}],
     *     {duration: 300, fill: "forwards"},
     *   ).play()
     * }> This will fade in! </div>
     * ```
     */
    function destinyIn(value, element) {
        if (!(value instanceof Function)) {
            throw new TypeError("Value of destiny:in must be a function");
        }
        queueMicrotask(// wait for stack to clear
        () => queueMicrotask(// let other microtasks run first
        () => void value(element)));
    }

    /**
     * Checks if input is a non-function Object.
     *
     * @param input The item to be checked
     */
    function isObject(input) {
        return !!input && typeof input === "object";
    }

    /**
     * `destiny:ref` prop allows you to to give a `ReactivePrimitive` to
     * the templater, which will then store the created element into
     * it once render is complete.
     *
     * Example usage:
     * ```js
     * const ref = new DestinyPrimitive;
     *
     * ref.pipe(element => {
     *   console.log(element.innerHTML); // "Hello!";
     * });
     *
     * html`
     *   <div destiny:ref=${ref}>Hello!</div>
     * `;
     * ```
     */
    function destinyRef(value, element) {
        if (!(value instanceof Ref)) {
            throw new TypeError(`Attribute value for destiny:ref must be a Ref, but it was [${isObject(value)
            ? `${value.constructor.name} (Object)`
            : `${String(value)} (${typeof value})`}] in \n${element.outerHTML}`);
        }
        queueMicrotask(() => {
            value.value = element;
        });
    }

    /**
     * Handler for destiny-namespaced attributes. See referenced methods for details.
     */
    function destiny(data, element) {
        for (const [key, value] of data) {
            switch (key) {
                case "ref":
                    destinyRef(value, element);
                    break;
                case "in":
                    destinyIn(value, element);
                    break;
                case "out":
                    destinyOut(element, value);
                    break;
                default:
                    throw new Error(`Invalid property "destiny:${key}" on element:\n${element.outerHTML}.`);
            }
        }
    }

    /**
     * `prop:<PropertyName>` takes in any property and assigns it to
     * the element in JS.
     *
     * Note that property names need to use kebab-case because HTML
     * is case-insensitive. The library will automatically convert
     * properties to camelCase. For example, to assign a Date object
     * to a date input (`input.valueAsDate = new Date`), you can do:
     * ```html
     * <inpyt type=date prop:value-as-date=${new Date}>
     * ```
     */
    function prop(props, element) {
        for (const [key, value] of props) {
            doOrBind(element, key, value, 
            //@ts-ignore TODO gotta figure out later if this can be resolved properly by TS
            (item) => element[key] = item);
        }
    }

    /**
     * `call:<ElementMethod>` takes an array of arguments to be passed to
     * the method being called, or a single argument to be called with.
     *
     * Note that method names need to use kebab-case instead of camelCase
     * because HTML is case-insensitive. The library automatically converts
     * kebab-cased function names into camelCase. For example, to call
     * "requestSubmit", call "request-submit".
     *
     * Note that like all namespaced attributes, input is not optional and
     * must be slotted with `${}` for performance reasons. To call something
     * without arguments, pass in an empty array.
     *
     * Example usage:
     *
     * ```html
     * <form call:request-submit=${[]}></form>
     * ```
     *
     * @param argument.element element the attribute is on
     * @param argument.attributeName name of the attribute, without the namespace
     * @param argument.value the value that was slotted in
     */
    function call(methodCalls, element) {
        for (const [key, value] of methodCalls) {
            doOrBind(element, key, value, value => {
                if (typeof element[key] === "function") {
                    if (Array.isArray(value)) {
                        //@ts-ignore TODO gotta figure out later if this can be resolved properly by TS
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                        element[key](...value);
                    }
                    else {
                        //@ts-ignore TODO gotta figure out later if this can be resolved properly by TS
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                        element[key](value);
                    }
                }
            });
        }
    }

    /**
     * `on:<EventName>` adds an event listener. It either takes a
     * callback function, or an array containing a callback
     * function and options.
     *
     * Example usage:
     * ```html
     * <button on:click=${() => alert("Hi!")}>Click me!</button>
     *
     * <container-block
     *   on:scroll=${[scrollHandler, {passive:true}]}
     * ></container-block>
     * ```
     */
    function on(eventListeners, element) {
        for (const [key, value] of eventListeners) {
            if (Array.isArray(value)) {
                //@ts-ignore TODO gotta figure out later if this can be resolved properly by TS
                element.addEventListener(key, ...value);
            }
            else {
                //@ts-ignore TODO gotta figure out later if this can be resolved properly by TS
                element.addEventListener(key, value);
            }
        }
    }

    /**
     * Takes care of hooking up data to an element.
     *
     * @param element Element to assign it on
     * @param data    What to assign
     */
    function assignElementData(element, data) {
        // console.log(element, data);
        attribute(data.attribute, element);
        destiny(data.destiny, element);
        prop(data.prop, element);
        call(data.call, element);
        on(data.on, element);
    }

    /**
     * A class for creating new custom elements in Destiny UI.
     */
    class DestinyElement extends HTMLElement {
        constructor() {
            super();
            this.assignedData = {
                prop: new Map(),
                on: new Map(),
                call: new Map(),
                destiny: new Map(),
                attribute: new Map(),
            };
            this.template = xml `<slot />`;
            if (new.target === DestinyElement) {
                throw new TypeError("Can't initialize abstract class.");
            }
            const shadow = this.attachShadow({ mode: "open" });
            queueMicrotask(() => {
                if (this.forwardProps) {
                    this.forwardProps.then(element => {
                        assignElementData(element, this.assignedData);
                    });
                }
                shadow.appendChild(this.template.content);
            });
            // Disabled for now due to lack of vendor support
            // try {
            //   this.attachInternals();
            // } catch (e) {
            //   console.error("Element internals couldn't be attached due to lack of browser support. If you're using Firefox, the feature can be enabled in about:config by toggling the dom.webcomponents.elementInternals.enabled flag on. If you're using something other than Firefox or a Chromium based browser, consider switching to a better browser. Error message: ", e);
            // }
        }
        replaceWith(...nodes) {
            if (this.destinySlot) {
                this.destinySlot.replaceItem(this, ...nodes);
            }
            else {
                super.replaceWith(...nodes);
            }
        }
        out(callback) {
            deferredElements.set(this, callback);
            return this;
        }
        static register() {
            return register(this, false);
        }
        static get tagName() {
            return this.register();
        }
        static [Symbol.toPrimitive]() {
            return this.tagName;
        }
    }
    DestinyElement.captureProps = false;

    /**
     * Makes sequential numbers appear random.
     * @param count   Maximum number of items
     * @param coprime A coperime of count which is also greater than count
     */
    const pseudoRandomEncode = (count, coprime) => (seed) => seed * coprime % count;

    const idEncoder = pseudoRandomEncode(2n ** 20n, 387420489n);
    /**
     * Generates up to 2**20 (~1M) IDs that are unique across the session.
     */
    function* pseudoRandomIdGenerator() {
        let i = 0n;
        while (true) {
            // Intentionally skip the first one because 0n converts to "0"
            yield idEncoder(++i).toString(36);
        }
    }

    function pascalToKebab(input) {
        return input.replace(/(?<!^)([A-Z])/g, "-$1").toLowerCase();
    }

    const pseudoRandomId = pseudoRandomIdGenerator();
    const registeredComponents = new Map();
    /**
     * Registers a DestinyElement component constructor as a Custom Element using its constructor name.
     * @param componentConstructor A constructor for the element to be registered
     * @param noHash               Opt out of adding a unique hash to the name
     */
    function register(componentConstructor, noHash = true) {
        const registeredName = registeredComponents.get(componentConstructor);
        if (registeredName) {
            return registeredName;
        }
        const givenName = componentConstructor.name;
        const name = `${(givenName
        ? pascalToKebab(givenName)
        : "anonymous")}${noHash
        ? ""
        : `-${pseudoRandomId.next().value}`}`;
        customElements.define(name, componentConstructor);
        registeredComponents.set(componentConstructor, name);
        return name;
    }

    class Ref {
        constructor() {
            this.#promise = new Promise(resolve => {
                this.#resolve = resolve;
            });
        }
        #resolve;
        #promise;
        set value(element) {
            this.#resolve(element);
        }
        then(callbackFn) {
            this.#promise = this.#promise.then(callbackFn);
            return this;
        }
        catch(callbackFn) {
            this.#promise = this.#promise.then(callbackFn);
            return this;
        }
        finally(callbackFn) {
            this.#promise.finally(callbackFn);
            return this;
        }
    }

    // type TUnwrapAll<T> = {
    //   [K in keyof T]: TUnwrap<T[K]>
    // };
    /**
     * `ReactivePrimitive`s are reactive values that contain a single value which can be updated and whose updates can be listened to.
     */
    class ReactivePrimitive {
        /**
         * @param initialValue the value to initialize the ReactivePrimitive with
         */
        constructor(initialValue) {
            /** All the callbacks added to the `ReactivePrimitive`, which are to be called when the `value` updates. */
            this.#callbacks = new Set;
            this.#value = initialValue;
        }
        /** The current value of the `ReactivePrimitive`. */
        #value;
        /** All the callbacks added to the `ReactivePrimitive`, which are to be called when the `value` updates. */
        #callbacks;
        /**
         * Same as `this.value`. The current value of the `ReactivePrimitive`.
         */
        valueOf() {
            return this.value;
        }
        /**
         * When the object is attempted to be cast to a primitive, the current value of `this.value` is used as a hint. Obviously, if you're trying to cast a `ReactivePrimitive<string>` into a `number`, it'll just cast `this.value` from a `string` to a `number`.
         */
        [Symbol.toPrimitive]() {
            return this.value;
        }
        get [Symbol.toStringTag]() {
            return `Destiny<${typeof this.#value}>`;
        }
        /**
         * Instances of this class can be iterated over asynchronously; it will iterate over updates to the `value`. You can use this feature using `for-await-of`.
         */
        async *[Symbol.asyncIterator]() {
            while (true) {
                yield await this._nextUpdate();
            }
        }
        /**
         * Returns a Promise which will resolve the next time the `value` is updated.
         */
        _nextUpdate() {
            return new Promise(resolve => {
                const cb = (v) => {
                    resolve(v);
                    this.#callbacks.delete(cb);
                };
                this.#callbacks.add(cb);
            });
        }
        /**
         * Adds a callback to be called whenever the `value` of the `ReacativePrimitive` is updated.
         * @param callback the function to be called on updates
         */
        bind(callback, noFirstCall = false) {
            this.#callbacks.add(callback);
            if (!noFirstCall)
                callback(this.#value);
            return this;
        }
        /**
         * Forces an update event to be dispatched.
         */
        update() {
            this.set(this.#value);
            return this;
        }
        /**
         * Can be used to functionally update the value.
         * @param value New value to be set
         * @param noUpdate One or more callback methods you don't want to be called on this update. This can be useful for example when responding to DOM events: you wouldn't want to update the DOM with the new value on the same element that caused the udpate in the first place.
         */
        set(value, ...noUpdate) {
            if (value !== this.#value) {
                this.#value = value;
                [...this.#callbacks.values()]
                    .filter(cb => !noUpdate.includes(cb))
                    .forEach(cb => cb(value));
            }
            return this;
        }
        /** The current `value` of the `ReactivePrimitive` */
        set value(value) {
            this.set(value);
        }
        get value() {
            return this.#value;
        }
        /**
         * Creates a new `ReactivePrimitive` from a callback and n other ReactivePrimitive(s) and/or ReactiveArray(s).
         * @param updater A callback function that is called when any of the reactive input items are updated. The return value of this function determines the value of the returned `ReactivePrimitive`.
         * @param refs One or more `ReactivePrimitive`s or `ReactiveArray`s which are to be piped into a new one.
         */
        static from(updater, ...refs) {
            const currentValue = () => updater(...refs.map(
            // This is fine. The type is not known and isn't a concern at this step.
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            v => v.value));
            const newRef = new ReactivePrimitive(currentValue());
            refs.forEach(ref => ref.bind(() => queueMicrotask(() => newRef.value = currentValue()), true));
            return newRef;
        }
        /**
         * Creates a new `ReactivePrimitive` which is dependent on the `ReactivePrimitive` it's called on, and is updated as the original one is updated. The value of the original is tranformed by a callback function whose return value determines the value of the resulting `ReactivePrimitive`.
         * @param callback A function which will be called whenever the original `ReactivePrimitive` is updated, and whose return value is assigned to the output `ReactivePrimitive`
         */
        pipe(callback) {
            return ReactivePrimitive.from(callback, this);
        }
        truthy(valueWhenTruthy, valueWhenFalsy) {
            return this.pipe(v => v ? valueWhenTruthy : valueWhenFalsy);
        }
        falsy(valueWhenFalsy, valueWhenTruthy) {
            return this.pipe(v => v ? valueWhenTruthy : valueWhenFalsy);
        }
        ternary(condition, yes, no) {
            return this.pipe(v => condition(v) ? yes : no);
        }
    }
    // const a = new ReactivePrimitive(3);
    // const b = new ReactivePrimitive("6");
    // const d = new ReactiveArray(["7", "8"]);
    // const c = ReactivePrimitive.from(
    //   (a, b, d) => a + b,
    //   a,
    //   b,
    //   d
    // );
    // console.log(a.value, b.value, c.value); //3, 6, 9
    // a.value++;
    // b.value = "38";
    // console.log(a.value, b.value, c.value); //4, 38, 42

    /**
     * Modifies a `PropertyDescriptor` to have its value reactive and sets it to unconfigurable.
     *
     * @param parent Another reactive entity to which any reactive items created should report to when updating, so updates can correctly propagate to the highest level
     */
    function propertyDescriptorToReactive(parent) {
        return (propertyDescriptorEntry) => {
            const [key, descriptor] = propertyDescriptorEntry;
            const get = descriptor.get?.bind(descriptor);
            const set = descriptor.set?.bind(descriptor);
            if ((get && !set) || // No point observing readonly properties
                (!get && set) // No point observing writeonly properties
            ) {
                return propertyDescriptorEntry;
            }
            descriptor.configurable = false;
            const ref = reactive(descriptor.value, { parent });
            if (!(get && set)) {
                /* No getters/setters to worry about */
                descriptor.value = ref;
            }
            else {
                /* Try avoid breaking existing getters & setters */
                if (!(ref instanceof ReactivePrimitive)) {
                    descriptor.writable = false;
                }
                descriptor.get = () => {
                    get(); // in case setter has side-effects
                    return ref;
                };
                descriptor.set = value => {
                    if (ref instanceof ReactivePrimitive) {
                        set(value);
                        ref.value = get(); // in case se resulting value is different from what's given to the setter
                    }
                    else {
                        throw new TypeError(`Illegal assignment to reactive object field ${key}`);
                    }
                };
            }
            return propertyDescriptorEntry;
        };
    }

    const reactiveObjectFlag = Symbol("Reactive Object");

    /**
     * Takes an object, and passes each of its non-function properties to `reactive()`, which makes the entire structure reactive recursively.
     *
     * !Note: this method modifies the original object. It may break code that relies on that not happening. There may be cases where objects (either the top level one, or one further down) misbehaves or breaks. To avoid an inner object from being converted, wrap it in `new ReactivePrimitive()`.
     *
     * @param input The object whose properties are to be made reactive
     * @param parent Another reactive entity to which any reactive items created should report to when updating, so updates can correctly propagate to the highest level
     */
    function reactiveObject(input, parent) {
        let current = input;
        const prototypeChain = [];
        do {
            prototypeChain.unshift(Object.getOwnPropertyDescriptors(current));
            // eslint-disable-next-line no-cond-assign
        } while (current = Reflect.getPrototypeOf(current));
        Object.seal(Object.defineProperties(input, Object.fromEntries(Object.entries(Object.assign(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        prototypeChain.shift(), ...prototypeChain, {
            [reactiveObjectFlag]: {
                writable: false,
                enumerable: false,
                value: true,
            },
        }))
            .filter(([, { value, configurable }]) => (typeof value !== "function" &&
            configurable))
            .map(propertyDescriptorToReactive(parent)))));
        return input;
    }

    /**
     * Makes an attempt to convert any value to a `number`. Returns `NaN` if conversion fails.
     * @param value Value to be converted to a number
     */
    function toNumber(value) {
        try {
            return Number(value);
        }
        catch { // Number(Symbol()) throws, but we just want to know if it can be converted to a number
            return NaN;
        }
    }

    /**
     * Configuration object for the `Proxy` created by `ReactiveArray`. The proxy is used for enabling dynamic index access using the bracket notation (ex: `arr[0] = "foo"`).
     */
    const reactiveArrayProxyConfig = {
        deleteProperty(target, property) {
            const index = toNumber(property);
            if (!Number.isNaN(index)) {
                target.splice(index, 1);
                return true;
            }
            else {
                return false;
            }
        },
        get(target, property) {
            const index = toNumber(property);
            if (!Number.isNaN(index)) { // Was valid number key (i.e. array index)
                return target.get(index);
            }
            else { // Was a string or symbol key
                const value = target[property];
                return (typeof value === "function"
                    ? value.bind(target) // Without binding, #private fields break in Proxies
                    : value);
            }
        },
        set(target, property, value) {
            const index = toNumber(property);
            if (!Number.isNaN(index)) {
                target.splice(index, 1, value);
                return true;
            }
            else {
                return false;
            }
        },
    };

    const nonRenderedValues = new Set([
        undefined,
        null,
        true,
        false,
    ]);
    const shouldBeRendered = (input) => !nonRenderedValues.has(input);
    /**
     * Converts a value that is about to be rendered in DOM into a string representation. `boolean`s and _nullish_ values are not rendered by design.
     * @param input
     */
    const stringifyValue = (input) => (shouldBeRendered(input)
        ? String(input)
        : "");

    /**
     * Converts an array of items into a `DocumentFragment`.
     * @param values The items to be converted
     */
    function arrayToFragment(values) {
        const fragment = new DocumentFragment;
        fragment.append(...values
            .filter(shouldBeRendered)
            .map(valueToFragment));
        return fragment;
    }

    /**
     * Converts a `Node` into a `DocumentFragment`.
     * @param node The `Node` to be converted
     */
    function nodeToFragment(node) {
        const fragment = new DocumentFragment;
        fragment.append(node);
        return fragment;
    }

    /**
     * A polymorphic helper which figures out the type of the input and determines a suitable way to convert it into a `DocumentFragment`.
     * @param value The item to be converted into a `DocumentFragment`
     */
    function valueToFragment(value) {
        if (value instanceof TemplateResult) {
            return value.content;
        }
        else if (value instanceof DocumentFragment) {
            return value;
        }
        else if (value instanceof Node) {
            return nodeToFragment(value);
        }
        else if (Array.isArray(value)) {
            return arrayToFragment(value);
        }
        else {
            return nodeToFragment(new Text(stringifyValue(value)));
        }
    }

    /** A counter for labling `Comment`s for `Slot`s. */
    let counter = 0;
    /**
     * Keeps track of sequences of DOM nodes that have been inserted into the document. For example, when a `DocumentFragment` is inserted, it may have multiple top-level elements which need to be prevented from merging with adjescent elements (in the case of `Text` nodes) and need to be removable when the state is updated.
     */
    class Slot {
        /**
         * @param placeholderNode A `Node` which is used as a "bookmark" of where in the DOM the `Slot`'s content should be inserted
         * @param content Initial content to be inserted into the slot
         */
        constructor(placeholderNode, content) {
            this.#id = counter++;
            this.#startAnchor = new Comment(`<DestinySlot(${this.#id})>`);
            this.#endAnchor = new Comment(`</DestinySlot(${this.#id})>`);
            this.#nodes = [placeholderNode];
            placeholderNode.replaceWith(this.#startAnchor, placeholderNode, this.#endAnchor);
            if (content) {
                this.update(content);
            }
        }
        #id;
        #startAnchor;
        #endAnchor;
        #nodes;
        replaceItem(whatToReplace, ...nodes) {
            const location = this.#nodes.indexOf(whatToReplace);
            if (location < 0)
                throw new Error("Can't replace an item that isn't here.");
            const newNodes = nodes.flatMap(v => (typeof v === "string" ? new Text(v) :
                v instanceof DocumentFragment ? [...v.childNodes] :
                    v));
            this._brandNodes(newNodes);
            whatToReplace.before(...newNodes);
            void this._disposeNodes([whatToReplace]);
            this.#nodes.splice(location, 1, ...newNodes);
        }
        _brandNodes(nodes) {
            nodes
                .forEach(node => node.destinySlot = this);
        }
        /**
         * Updates the content of the slot with new content
         * @param fragment New content for the slot
         */
        update(input) {
            const fragment = input instanceof TemplateResult
                ? input.content
                : input;
            void this._disposeCurrentNodes();
            this.#nodes = Object.values(fragment.childNodes);
            this._brandNodes(this.#nodes);
            this.#endAnchor.before(fragment);
        }
        async _disposeNodes(nodesToDisposeOf) {
            await Promise.all(nodesToDisposeOf.map(node => deferredElements.get(node)?.(node)));
            for (const node of nodesToDisposeOf) {
                node.remove();
            }
        }
        /**
         * First removes all the current nodes from this Slot's list of tracked nodes, then waits for any exit tasks (such as animations) these nodes might have, and removes each node once all the tasks have finished running.
         */
        async _disposeCurrentNodes() {
            await this._disposeNodes(this.#nodes.splice(0, this.#nodes.length));
        }
        /**
         * Removes all the associated content from the DOM and destroys the `Slot`. Note: this is an async function and will wait for any exit animations or other tasks to finish before removing anything. Exit tasks for HTML elements are defined by the `destiny:out` attribute; if the callback function given to it returns a `Promise`, that's what's being awaited before removal.
         */
        async remove() {
            await this._disposeCurrentNodes();
            this.#startAnchor.remove();
            this.#endAnchor.remove();
        }
        /**
         * Inserts one or more `Node`s into the DOM before the start of the `Slot`.
         * @param nodes
         */
        insertBeforeThis(...nodes) {
            this.#startAnchor.before(...nodes);
        }
    }

    /**
     * Keeps track of `ReactiveArray`s slotted into a template in the DOM.
     */
    class SlotArray {
        /**
         * @param placeholderNode A `Node` which is used as a "bookmark" of where in the DOM the `SlotArray`'s content should be inserted
         * @param source The `ReactiveArray` which is being rendered
         */
        constructor(placeholderNode, source) {
            /** A "bookmark" for where in the DOM this `SlotArray` starts */
            this.#startAnchor = new Comment("<DestinyArray>");
            /** A "bookmark" for where in the DOM this `SlotArray` ends */
            this.#endAnchor = new Comment("</DestinyArray>");
            /** All the `Slot`s being tracked by this instance */
            this.#domArray = [];
            /**
             * Analogous to `ReactiveArray::splice()`. Removes zero or more `Slot`s from DOM, and inserts zero or more new ones.
             * @param index Index at which to start modifying `Slots`
             * @param deleteCount How many `Slot`s to remove
             * @param items Any new items to be inserted into DOM
             */
            this.update = (index, deleteCount, ...items) => {
                this._removeFromDom(index, deleteCount);
                this._insertToDom(index, ...items);
            };
            placeholderNode.replaceWith(this.#startAnchor, this.#endAnchor);
            this.#source = source;
            this.#source.bind(this.update);
        }
        /** A "bookmark" for where in the DOM this `SlotArray` starts */
        #startAnchor;
        /** A "bookmark" for where in the DOM this `SlotArray` ends */
        #endAnchor;
        /** The original `ReactiveArray` this instance is receiving updates from */
        #source;
        /** All the `Slot`s being tracked by this instance */
        #domArray;
        /**
         * Inserts zero or more `DocumentFragment`s into the DOM, and creates `Slot`s out of them to track them.
         * @param index Index at which to insert the items
         * @param fragments the items to be inserted
         */
        _insertToDom(index, ...fragments) {
            fragments.forEach((fragment, i) => {
                const where = i + index;
                const slotPlaceholder = new Comment("Destiny slot placeholder");
                if (!this.#domArray.length || where > this.#domArray.length - 1) {
                    this.#endAnchor.before(slotPlaceholder);
                }
                else {
                    this.#domArray[where].insertBeforeThis(slotPlaceholder);
                }
                this.#domArray.splice(where, 0, new Slot(slotPlaceholder, fragment));
            });
        }
        /**
         * Removes zero or more `Slot`s from the DOM.
         * @param from Index at which to start removing `Slot`s
         * @param count How many `Slot`s to remove
         */
        _removeFromDom(from, count) {
            const to = Math.min(from + count, this.#domArray.length);
            for (let i = from; i < to; i++) {
                void this.#domArray[i].remove();
            }
            this.#domArray.splice(from, count);
        }
    }

    /**
     * Goes through all the elements in a template that are flagged with the `destiny:content` attribute and figures out how the DOM needs to be updated if any of the given props are reactive.
     * @param templ A template element that has been processed by `resolveSlots()`.
     * @param props Any items that were slotted into the HTML template
     */
    function hookContentSlotsUp(templ, props) {
        const contentSlots = Object.values(templ.querySelectorAll("[destiny\\:content]"));
        for (const contentSlot of contentSlots) {
            const index = contentSlot.getAttribute("destiny:content");
            const item = props[Number(index)];
            if (item instanceof ReactivePrimitive) {
                const slot = new Slot(contentSlot);
                item.bind(value => {
                    slot.update(valueToFragment(value));
                });
            }
            else if (item instanceof ReactiveArray) {
                new SlotArray(contentSlot, item);
            }
            else {
                new Slot(contentSlot, valueToFragment(item));
            }
        }
    }

    function resolveSlotPositions(value) {
        return [...value.matchAll(/(?<start>^.+?)?__internal_(?<index>[0-9]+)_(?<after>.+?(?=__internal_(?:[0-9]+)_|$))?/gu)];
    }

    function resolveAttributeValue(val, props) {
        let attrVal;
        if (val.length === 1 && !val[0].groups.start && !val[0].groups.after) {
            // console.log(val[0].groups.index);
            attrVal = props[Number(val[0].groups.index)];
        }
        else {
            const resolvedValue = val.reduce((acc, value) => {
                const item = props[Number(value.groups.index)];
                if (item instanceof ReactivePrimitive) {
                    acc.items.push(item);
                    acc.trailings.push(value.groups.after ?? "");
                }
                else {
                    acc.trailings[acc.trailings.length - 1] += String(item) + (value.groups.after ?? "");
                }
                return acc;
            }, {
                items: [],
                trailings: [val[0]?.groups.start ?? ""],
            });
            if (resolvedValue.items.length) {
                attrVal = ReactivePrimitive.from((...args) => resolvedValue.trailings.reduce((a, v, i) => a + String(args[i]) + v), ...resolvedValue.items);
            }
            else {
                attrVal = resolvedValue.trailings[0];
            }
        }
        return attrVal;
    }

    /**
     * Converts kebab-cased text to camelCased text.
     * @param input string to be converted
     */
    function kebabToCamel(input) {
        return input.replace(/(-[a-z])/g, match => match[1].toUpperCase());
    }

    const validNamespaces = ["attribute", "prop", "call", "on", "destiny"];
    function isValidNamespace(input) {
        return validNamespaces.includes(input);
    }

    function parseAttributeName(input) {
        const { namespace = "attribute", attributeNameRaw, } = (/(?:(?<namespace>[a-z]+):)?(?<attributeNameRaw>.+)/
            .exec(input)
            ?.groups
            ?? {});
        const attributeName = (namespace !== "attribute"
            ? kebabToCamel(attributeNameRaw)
            : attributeNameRaw);
        if (!isValidNamespace(namespace)) {
            throw new Error("Invalid namespace");
        }
        return [namespace, attributeName];
    }

    /**
     * Goes through all the elements in a template that are flagged with the `destiny::attr` attribute and figures out what events need to be listened to, and how the DOM needs to be updated if any of the given props are reactive.
     * @param templ A template element that has been processed by `resolveSlots()`.
     * @param props Any items that were slotted into the HTML template
     */
    function hookAttributeSlotsUp(templ, props) {
        const attributeSlots = Object.values(templ.querySelectorAll("[destiny\\:attr],[data-capture-props]"));
        for (const element of attributeSlots) {
            const { captureProps } = element.dataset;
            const values = {
                prop: new Map(),
                on: new Map(),
                call: new Map(),
                destiny: new Map(),
                attribute: new Map(),
            };
            for (const { name, value } of element.attributes) {
                const val = resolveSlotPositions(value);
                //if no slots, skip
                if (!val.length) {
                    if (captureProps && name !== "destiny:attr") {
                        const [namespace, attributeName] = parseAttributeName(name);
                        values[namespace].set(attributeName, value);
                    }
                    continue;
                }
                const attrVal = resolveAttributeValue(val, props);
                const [namespace, attributeName] = parseAttributeName(name);
                values[namespace].set(attributeName, attrVal);
            }
            if (captureProps) {
                queueMicrotask(() => {
                    element.assignedData = values;
                });
            }
            else {
                assignElementData(element, values);
            }
        }
    }

    /**
     * Goes through the elements in a given `HTMLTemplateElement`, and adds reactivity to any slots that were given a reactive item to keep the view in sync with the application state.
     * @param template A parsed `HTMLTemplateElement` which has been processed by `resolveSlots()`
     * @param props Items that were originally slotted into the template prior to parsing
     */
    function hookSlotsUp(template, props) {
        hookAttributeSlotsUp(template, props);
        hookContentSlotsUp(template, props);
    }

    class Renderable {
    }

    class TemplateResult extends Renderable {
        constructor(template, props) {
            super();
            this.#template = template;
            this.#props = props;
        }
        #template;
        #props;
        get content() {
            const content = this.#template.content.cloneNode(true);
            hookSlotsUp(content, this.#props);
            return content;
        }
    }

    /**
     * Basically, because TS doesn't support nominal typing, we have to use this hack to exclude unwanted objects from our reactive methods.
     */
    const specialCaseObjects = [
        Function,
        Date,
        RegExp,
        DocumentFragment,
        TemplateResult,
    ];
    function isSpecialCaseObject(input) {
        const type = typeof input;
        if (type === "function")
            return true;
        else if (type !== "object")
            return false;
        else
            return specialCaseObjects.some(constr => input instanceof constr);
    }

    /**
     * Checks if a given value is a reactive value; I.E. an instance of `ReactivePrimitive` or `ReactiveArray`, or a `reactiveObject` which is flagged by the `reacativeObjecetFlag` symbol.
     *
     * @param input The value to be checked
     */
    function isReactive(input) {
        return [
            ReactiveArray,
            ReactivePrimitive,
        ].some(constr => input instanceof constr) || (!!input &&
            typeof input === "object" &&
            reactiveObjectFlag in input);
    }

    /**
     * Converts a given array of values into a reactive value recursively if it's not to be treated as a primitive. I.E. `Array`s and most `Object`s will be converted, but primitive values will not. This is useful for `ReactiveArrays`, whose direct children are managed directly by the class itself, but whose deeply nested descendants need to be tracked separately.
     * @param items The items to be converted
     * @param parent Another reactive object to whom any reactive items created should report to when updating, so updates can correctly propagate to the highest level
     */
    function makeNonPrimitiveItemsReactive(items, parent) {
        return items.map((v) => {
            return (isReactive(v) || !isObject(v) || isSpecialCaseObject(v)
                ? v
                : reactive(v, { parent: parent }));
        });
    }

    /**
     * An error that is thrown for features that are intended to be implemented, but are not implemented yet.
     */
    class NotImplementedError extends Error {
        /**
         * @param message Additional information about the feature or why it's not supported yet
         */
        constructor(message) {
            super(message);
            this.name = "NotImplementedError";
        }
    }

    const processUpdateQueue = (updateQueue, filteredArray) => {
        if (!updateQueue.length)
            return;
        const addedItems = [];
        let deleteCount = 0;
        for (const item of updateQueue) {
            if (item.show) {
                addedItems.push(item.value);
            }
            else {
                deleteCount++;
            }
        }
        const startEditingAt = updateQueue.find(v => v.show)?.index ?? updateQueue[0].index + 1;
        filteredArray.splice(startEditingAt, deleteCount, ...addedItems);
        updateQueue.splice(0, updateQueue.length);
    };
    const updateFilteredArray = (callback, sourceArray, filteredArray, maskArray) => {
        let newIndex = -1;
        const updateQueue = [];
        for (const [i, item] of sourceArray.entries()) {
            const showThis = callback(item, i, sourceArray);
            if (showThis) {
                newIndex++;
            }
            if (showThis !== maskArray[i].show) {
                const current = {
                    index: newIndex,
                    show: showThis,
                    value: item,
                };
                updateQueue.push(current);
                maskArray[i] = current;
            }
            else {
                processUpdateQueue(updateQueue, filteredArray);
            }
        }
        processUpdateQueue(updateQueue, filteredArray);
    };

    /**
     * `ReactiveArray`s are reactive values that contain multiple values which can be updated and whose updates can be listened to. In general, `ReactiveArray`s behave very similar to native `Array`s. The main difference is, that most primitive values are given as `ReactivePrimitive`s and any immutable methods will return a new readonly `ReactiveArray`, whose values are tied to the original `ReactiveArray`. The class also provides a few custom convenience methods.
     */
    class ReactiveArray {
        constructor(...input) {
            /** A Set containing all the callbacks to be called whenever the ReactiveArray is updated */
            this.#callbacks = new Set;
            this.#value = makeNonPrimitiveItemsReactive(input, this);
            this.#length = ReactivePrimitive.from(() => this.#value.length, this);
            this.#indices = input.map((_, i) => new ReactivePrimitive(i));
            return new Proxy(this, reactiveArrayProxyConfig);
        }
        /** An Array containing the current values of the ReactiveArray */
        #value;
        /** An Array containing ReactivePrimitives for each index of the ReactiveArray */
        #indices;
        /** A Set containing all the callbacks to be called whenever the ReactiveArray is updated */
        #callbacks;
        /** Size of the ReactiveArray as a ReactivePrimitive */
        #length;
        /**
         * Iterates over the values of the array, similar to how regular Arrays can be iterated over.
         */
        *[Symbol.iterator]() {
            yield* this.#value;
        }
        /**
         * Iterates over the updates to the array. Can be used with for-await-of.
         */
        async *[Symbol.asyncIterator]() {
            while (true) {
                yield await this._nextUpdate();
            }
        }
        /**
         * Returns a promise that resolves when the next update fires, with the values the event fired with.
         */
        _nextUpdate() {
            return new Promise(resolve => {
                const cb = (...props) => {
                    resolve(props);
                    this.#callbacks.delete(cb);
                };
                this.#callbacks.add(cb);
            });
        }
        /**
         * The length of the ReactiveArray, as a ReactivePrimitive which updates as the array is modified.
         */
        get length() {
            return this.#length;
        }
        /**
         * Returns the current values of the ReactiveArray as a regular Array.
         */
        get value() {
            return this.#value.slice(0);
        }
        // This is not a setter because TS doesn't like setters and getters having different values. The input array is turned reactive recursively.
        /**
         * Replaces all the current values of the array with values of the provided array.
         * @param items array of items to replace the current ones with.
         */
        setValue(items) {
            this.splice(0, this.#value.length, ...items);
            return this;
        }
        /**
         * An alternative to using backet syntax `arr[index]` to access values. Bracket notation requires the Proxy, which slows down propety accesses, while this doesn't.
         * @param index index at which you want to access a value
         */
        get(index) {
            const i = (index < 0
                ? this.#value.length + index
                : index);
            return this.#value[i];
        }
        /**
         * An alternative to using backet syntax `arr[index] = value` to set values. Bracket notation requires the Proxy, which slows down propety accesses, while this doesn't.
         * @param index index at which you want to set a value
         * @param value value you want to set at the specified index
         */
        set(index, value) {
            this.splice(index, 1, value);
            return value;
        }
        /**
         * Returns the arguments that a full, forced, update would for a callback. I.E. first item in the array is the index (`0`), second argument is delte count (current array length), and 3...n are the items currently in the array.
         */
        _argsForFullUpdate() {
            return [0, this.#value.length, ...this.#value];
        }
        /**
         * Creates a new ReactivePrimitive which is bound to the array it's called on. The value of the ReactivePrimitive is determined by the callback function provided, and is called every time theh array updates to update the value of the returned ReactivePrimitive.
         *
         * @param callback The function to be called when the array is updated. It's called with `(startIndex, deleteCount, ...addedItems)`.
         */
        pipe(callback) {
            const ref = new ReactivePrimitive(callback(...this._argsForFullUpdate()));
            this.bind((...args) => {
                ref.value = callback(...args);
            }, true);
            return ref;
        }
        /**
         * Adds a listener to the array, which is called when the array is modified in some capacity.
         * @param callback The function to be called when the array is updated. It's called with `(startIndex, deleteCount, ...addedItems)`.
         * @param noFirstRun Default: false. Determines whether the callback function should be called once when the listener is first added.
         */
        bind(callback, noFirstRun = false) {
            this.#callbacks.add(callback);
            if (!noFirstRun) {
                callback(0, 0, ...this.#value);
            }
            return this;
        }
        /**
         * Removes a listener that was added using `ReactiveArray::bind()`.
         * @param callback The callback function to be unbound (removed from the array's update callbacks). Similar to EventListeners, it needs to be a reference to the same callaback function that was previously added.
         */
        unbind(callback) {
            this.#callbacks.delete(callback);
            return this;
        }
        //#region Mutating methods
        // Unless specified otherwise, these methods follow the signature of equivalent Array prototype methods.
        /**
         * Conbines the array with one or more other arrays, or other values.
         *
         * Similar to `Array::concat()`, except that it returns a readonly ReactiveArray. It accepts arrays, ReactiveArrays, ReactivePrimitives, or other items as parameters. Any ReactiveArrays or ReactivePrimitives will be tracked, and the resulting ReacativeArray will be updated whenever they get updated.
         *
         * @param items The items to be tacked onto the original array.
         */
        concat(...items) {
            const newArr = this.clone();
            this.bind(newArr.splice.bind(newArr));
            const lengthTally = [
                this.length,
            ];
            function currentOffset(cutoff, index = 0) {
                let tally = index;
                for (let i = 0; i < cutoff; i++) {
                    tally += lengthTally[i].value;
                }
                return tally;
            }
            for (const [i, item] of items.entries()) {
                if (item instanceof ReactiveArray) {
                    item.bind((index, deleteCount, ...values) => newArr.splice(currentOffset(i, index), deleteCount, ...values));
                    lengthTally.push(item.length);
                }
                else if (item instanceof ReactivePrimitive) {
                    item.bind(value => newArr.splice(currentOffset(i), 1, value));
                    lengthTally.push({
                        value: 1,
                    });
                }
                else if (Array.isArray(item)) {
                    newArr.splice(currentOffset(i), 0, ...item);
                    lengthTally.push({
                        value: item.length,
                    });
                }
                else {
                    newArr.splice(currentOffset(i), 0, item);
                    lengthTally.push({
                        value: 1,
                    });
                }
            }
            return newArr;
        }
        /**
         * Works just like `Array::copyWithin()`. Returns the this object after shallow-copying a section of the array identified by start and end to the same array starting at position target
         * @param target Index where to start copying to. If target is negative, it is treated as length+target where length is the length of the array.
         * @param start Where to start copying from. If start is negative, it is treated as length+start. Default: `0`.
         * @param end Where to stop copying from. If end is negative, it is treated as length+end. Default: `this.length.value`
         */
        copyWithin(target, start = 0, end = this.#value.length) {
            const { length } = this.#value;
            target = (target + length) % length;
            start = (start + length) % length;
            end = (end + length) % length;
            const deleteCount = Math.min(length - start, end - start);
            this.splice(target, deleteCount, ...this.#value.slice(start, deleteCount + start));
            return this;
        }
        /**
         * Works similar to `Array::fill()`, except inserted values are made recursively reactive. The section identified by start and end is filled with `value`. **Note** that inserted object values are not cloned, which may cause unintended behavior.
      
         * @param value  value to fill array section with
         * @param start  index to start filling the array at. If start is negative, it is treated as length+start where length is the length of the array.
         * @param end    index to stop filling the array at. If end is negative, it is treated as length+end.
         */
        fill(value, start = 0, end = this.#value.length) {
            const length = end - start;
            this.splice(start, length, ...Array.from({ length }, () => value));
            return this;
        }
        /**
         * Equivalent to Array::filter(), except that it mutates the array in place. Removes the elements of the array that don't meet the condition specified in the callback function.
         *
         * @param callback The filter method calls the callback function once for each element in the array to determine if it should be removed.
         */
        mutFilter(callback) {
            this.#value
                .flatMap((v, i, a) => callback(v, i, a) ? [] : i)
                .reduce((acc, indexToDelete) => {
                if (!acc.length || acc[0][0] + acc[0][1] !== indexToDelete) {
                    acc.unshift([indexToDelete, 1]);
                }
                else {
                    acc[0][1]++;
                }
                return acc;
            }, [])
                .forEach(args => {
                this.splice(...args);
            });
            return this;
        }
        /**
         * Similar to `Array::map`, except that it mutates the array in place. Calls a defined callback function on each element of an array, and assigns the resulting element if it's different from the old one.
         *
         * @param callback The map method calls the callback function one time for each element in the array.
         */
        mutMap(callback) {
            this.#value
                .flatMap((v, i, a) => {
                const newValue = callback(v, i, a);
                return newValue === v
                    ? []
                    : { index: i, value: newValue };
            })
                .reduce((acc, { index, value }) => {
                if (!acc.length || acc[0][0] + acc[0][1] !== index) {
                    acc.unshift([index, 1, value]);
                }
                else {
                    acc[0][1]++;
                    acc[0].push(value);
                }
                return acc;
            }, [])
                .forEach(args => {
                this.splice(...args);
            });
            return this;
        }
        /**
         * Works just like `Array::pop()`. Removes the last element from an array and returns it.
         */
        pop() {
            return this.splice(-1, 1)[0];
        }
        /**
         * Similar to `Array::push()`. Appends new element(s) to an array, and returns the new length of the array as a reactive number.
         */
        push(...items) {
            this.splice(this.#value.length, 0, ...items);
            return this.length;
        }
        /**
         * Works just like `Array::reverse()`. Reverses the elements of the array in place.
         */
        reverse() {
            this.setValue(this.#value.reverse());
            return this;
        }
        /**
         * Works just like `Array.shift()`. Removes the first element from an array and returns it.
         */
        shift() {
            return this.splice(0, 1)[0];
        }
        /**
         * Works just like `Array::sort()`. Sorts the array.
         *
         * @param compareFn  Specifies a function that defines the sort order. It is expected to return a negative value if first argument is less than second argument, zero if they're equal and a positive value otherwise. If omitted, the array elements are converted to strings, then sorted according to each character's Unicode code point value.
         */
        sort(compareFn) {
            this.setValue(this.#value.sort(compareFn));
            return this;
        }
        /**
         * Similar to `Array::splice()`. Added items are implicitly made recursively reactive.
         * @param start        Where to start modifying the array
         * @param deleteCount  How many items to remove
         * @param items        Items to add to the array
         */
        splice(start, deleteCount = this.#value.length - start, ...items) {
            if (start > this.#value.length) {
                throw new RangeError(`Out of bounds assignment: tried to assign to index ${start}, but array length was only ${this.#value.length}. Sparse arrays are not allowed. Consider using .push() instead.`);
            }
            this._adjustIndices(start, deleteCount, items);
            const reactiveItems = makeNonPrimitiveItemsReactive(items, this);
            const deletedItems = this.#value.splice(start, deleteCount, ...reactiveItems);
            this._dispatchUpdateEvents(start, deleteCount, reactiveItems);
            return deletedItems;
        }
        _dispatchUpdateEvents(start, deleteCount, newItems = []) {
            for (const callback of this.#callbacks) {
                queueMicrotask(() => {
                    callback(start, deleteCount, ...newItems);
                });
            }
        }
        /**
         * Updates the indices of each item whose index changed due to the update. Indices of removed items will become `-1`. Also inserts in new indices as `ReactivePrimitive<number>` for any added items.
         * @param start Index at which the ReactiveArray started changing
         * @param deleteCount How many items were deleted
         * @param items Items that were added
         */
        _adjustIndices(start, deleteCount, items) {
            const shiftedBy = items.length - deleteCount;
            if (shiftedBy) {
                for (let i = start + deleteCount; i < this.#indices.length; i++) {
                    this.#indices[i].value += shiftedBy;
                }
            }
            const removedIndices = this.#indices.splice(start, deleteCount, ...items.map((_, i) => new ReactivePrimitive(i + start)));
            for (const removedIndex of removedIndices) {
                removedIndex.value = -1;
            }
        }
        /**
         * Force the the array to dispatch events to its callback. The event will simply say `0` items were removed at index `0`, with `0` items added. No equivalent on native Array prototype.
         */
        update() {
            this._dispatchUpdateEvents(0, 0);
            return this;
        }
        /**
         * Similar to `Array::unshift()`. Returns the new length after the item(s) have been inserted.
         */
        unshift(...items) {
            this.splice(0, 0, ...items);
            return this.length;
        }
        //#endregion
        // #region Non-mutating methods that return a new ReaectiveArray
        // Unless specified otherwise, these behave in a similar manner to the equivalent Array prototype methods, except that they return a reactive ReaectiveArray instead of a regular Array.
        /**
         * Similar to `Array::filter()`, except that it returns a readonly ReactiveArray, which is updated as the originating array is mutated. If you don't want this begavior, use `ReactiveArray.prototype.value.filter()` instead.
         */
        filter(callback, dependencies = []) {
            const filteredArray = new ReactiveArray;
            const maskArray = [];
            dependencies.forEach(dependency => {
                dependency.bind(() => updateFilteredArray(callback, this.#value, filteredArray, maskArray), true);
            });
            this.bind((start, deletes, ...items) => {
                const lastInMask = maskArray.slice(0, start).reverse().find(v => v.show);
                const newItems = [];
                let currentIndex = (lastInMask?.index ?? -1);
                const deletedMaskEntries = deletes
                    ? maskArray.splice(start, deletes)
                    : [];
                for (const [i, item] of items.entries()) {
                    const sourceIndex = start + i;
                    const showThis = callback(item, sourceIndex, this.#value);
                    if (showThis) {
                        currentIndex++;
                    }
                    const current = {
                        index: currentIndex,
                        show: showThis,
                    };
                    maskArray.splice(sourceIndex, 0, current);
                    if (showThis) {
                        newItems.push(item);
                    }
                }
                const deletedItemCount = deletedMaskEntries.filter(v => v.show).length;
                if (newItems.length || deletedItemCount) {
                    filteredArray.splice((lastInMask?.index ?? -1) + 1, deletedItemCount, ...newItems);
                }
                const shiftTailBy = newItems.length - deletedItemCount;
                if (shiftTailBy) {
                    for (let i = start + items.length; i < maskArray.length; i++) {
                        maskArray[i].index += shiftTailBy;
                    }
                }
            });
            return filteredArray;
        }
        // TODO
        flat(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars-experimental
        depth = 1) {
            throw new NotImplementedError("See https://github.com/0kku/destiny/issues/1");
            // const newArr = new ReactiveArray(
            //   ...this.#value.flat(depth),
            // );
            // this.#callbacks.add(
            //   () => newArr.setValue(
            //     this.#value.flat(depth),
            //   ),
            // );
            // return newArr;
        }
        // TODO
        flatMap(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars-experimental
        callback) {
            throw new NotImplementedError("See https://github.com/0kku/destiny/issues/1");
            // const newArr = new ReactiveArray(
            //   ...this.#value.flatMap(callback)
            // );
            // this.pipe(() => {
            //   newArr.setValue(
            //     this.#value.flatMap(callback),
            //   );
            // });
            // return newArr;
        }
        /**
         * Similar to `Array::map()`, except that it returns a readonly ReactiveArray, which gets gets updated with mapped values as the originating array is updated. If you don't want this behavior, use `ReactiveArray.prototype.value.map()` instead.
         */
        map(callback) {
            const cb = (v, i) => callback(v, this.#indices[i], this);
            const newArr = new ReactiveArray(...this.#value.map(cb));
            this.#callbacks.add((index, deleteCount, ...values) => newArr.splice(index, deleteCount, ...values.map((v, i) => cb(v, i + index))));
            return newArr;
        }
        /**
         * Returns a new reactive array with all the values of the array it's called on, without any of its callbacks. The new array is not tied to the original one in any capacity. This is a custom method, and an equivalent is not available in native Arrays.
         */
        clone() {
            return new ReactiveArray(...this.#value);
        }
        /**
         * Similar to `Array::slice()`, except that it returns a readonly ReactiveArray, whose values are bound to the orignating array. Furthermore, if the orignating array gets items inserted or removed in the range of the spliced section (inclusive), those items will get inserted to the returned array as well. If you don't want this behavior, use `ReactiveArray.prototype.value.slice()` instead.
         *
         * **Note:** `ReactiveArray::slice(0)` is not a suitable way to clone a reactive array. The output array is readonly, and values from the original array are piped into it. Use `ReactiveArray::clone()` instead.
         */
        slice(start = 0, end = this.#value.length - 1) {
            const newArr = new ReactiveArray(...this.#value.slice(start, end));
            this.bind((index, deleteCount, ...values) => newArr.splice(index - start, deleteCount, ...values.slice(0, end - start - index)));
            return newArr;
        }
        /**
         * Similar to `Array::indexOf()`, except that it returns a readonly `ReactivePrimitive<number>`, which is updated as the array changes. The array is not searched again when the array changes. If nothing is found, `Readonly<ReactivePrimitive<-1>>` is returned, and it will never change. If something _is_ found, the index of that specific item will be kept up to date even when items are added or removed in a way that changes its index. If you don't want this behavior, use `ReactiveArray.prototype.value.indexOf()` instead.
         *
         * **NOTE:** _This method should **not** be used for checking if an array includes something: use `ReactiveArray::includes()` instead._
         */
        indexOf(...args) {
            const index = this.#value.indexOf(...args);
            return index === -1
                ? new ReactivePrimitive(-1)
                : this.#indices[index];
        }
        /**
         * Similar to `Array::lastIndexOf()`, except that it returns a readonly `ReactivePrimitive<number>`, which is updated as the array changes. The array is not searched again when the array changes. If nothing is found, `Readonly<ReactivePrimitive<-1>>` is returned, and it will never change. If something _is_ found, the index of that specific item will be kept up to date even when items are added or removed in a way that changes its index. If you don't want this behavior, use `ReactiveArray.prototype.value.lastIndexOf()` instead.
         */
        lastIndexOf(...args) {
            const index = this.#value.lastIndexOf(...args);
            return index === -1
                ? new ReactivePrimitive(-1)
                : this.#indices[index];
        }
        /**
         * Similar to `Array::join()`, except that it returns a readonly `ReactivePrimitive<string>`, which is updated as the array changes. If you don't want this behavior, use `ReactiveArray.prototype.value.join()` instead.
         */
        join(...args) {
            return this.pipe(() => this.#value.join(...args));
        }
        /**
         * Similar to `Array::every()`, except that it returns a readonly `ReactivePrimitive<boolean>`, which is updated as the array changes. If you don't want this behavior, use `ReactiveArray.prototype.value.every()` instead.
         */
        every(...args) {
            return this.pipe(() => this.#value.every(...args));
        }
        /**
         * Similar to `Array::some()`, except that it returns a readonly `ReactivePrimitive<boolean>`, which is updated as the array changes. If you don't want this behavior, use `ReactiveArray.prototype.value.some()` instead.
         */
        some(...args) {
            return this.pipe(() => this.#value.some(...args));
        }
        /**
         * Returns a readonly `ReactivePrimitive<boolean>`, which is set to true when the callback returns true for some, but not all items in the array. Is updated as the array updates. This is a custom method, and a non-reactive variant is not available on the native Array prototype.
         */
        exclusiveSome(cb) {
            return this.pipe(() => {
                const mappedValues = this.#value.map(cb);
                return (mappedValues.includes(false) &&
                    mappedValues.includes(true));
            });
        }
        /**
         * Behaves akin to `Array::forEach()`, except will call the callback on newly added items as they're added. If you don't want this behavior, use `ReactiveArray.prototype.value.forEach()` instead.
         */
        forEach(...args) {
            this.#value.forEach(...args);
            this.bind((_index, _deleteCount, ...addedItems) => addedItems.forEach(...args));
        }
        /**
         * Similar to `Array::reduce()`, except that its return value is a readonly ReactivePrimitive and will be reevaluated every time the array changes. If you don't want this behavior, use `ReactiveArray.prototype.value.reduce()` for a non-reactive result.
         */
        reduce(...args) {
            return this.pipe(() => this.#value.reduce(...args));
        }
        /**
         * Similar to `Array::reduceRight()`, except that its return value is a readonly ReactivePrimitive and will be reevaluated every time the array changes. If you don't want this behavior, use `ReactiveArray.prototype.value.reduceRight()` for a non-reactive result.
         */
        reduceRight(...args) {
            return this.pipe(() => this.#value.reduceRight(...args));
        }
        /**
         * Works just like `Array::find()`. Doesn't return a reactive value.
         */
        find(...args) {
            return this.#value.find(...args);
        }
        /**
         * Similar to `Array::findIndex`, except that it returns a `ReactivePrimitive<number>` whose value is updated if the index of the item changes as other items are added or removed from the array. The array is not searched again as it's mutated, however. If nothing is found, `Readonly<ReactivePrimitive<-1>>` is returned, and its value will never be updated. If you don't want this behavior, use `ReactiveArray.prototype.value.findIndex()` instead.
         */
        findIndex(...args) {
            const index = this.#value.findIndex(...args);
            return index === -1
                ? new ReactivePrimitive(-1)
                : this.#indices[index];
        }
        /**
         * Works similar to `Array::entries()`. The difference is that it returns a readonly ReactiveArray containing the entries and is updated as the original array is updated. If you don't want this behavior, use `ReactiveArray.prototype.value.entries()` for a writable non-reactive array instead.
         */
        entries() {
            const array = new ReactiveArray(...this.#value.entries());
            this.bind((index, deleteCount, ...addedItems) => {
                array.splice(index, deleteCount, ...addedItems.entries());
            }, true);
            return array;
        }
        /**
         * Works similar to `Array::keys()`. The difference is that it returns a readonly ReactiveArray containing the keys and is updated as the original array is updated. If you don't want this behavior, use `ReactiveArray.prototype.value.keys()` for a writable non-reactive array instead.
         */
        keys() {
            const array = new ReactiveArray(...this.#value.keys());
            this.bind((index, deleteCount, ...addedItems) => {
                array.splice(index, deleteCount, ...addedItems.keys());
            }, true);
            return array;
        }
        /**
         * Works similar to `Array::values()`. The difference is that it returns a readonly ReactiveArray containing the values and is updated as the original array is updated. If you don't want this behavior, use `ReactiveArray.prototype.value.values()` for a writable non-reactive array instead.
         */
        values() {
            const array = new ReactiveArray(...this.#value.values());
            this.bind((index, deleteCount, ...addedItems) => {
                array.splice(index, deleteCount, ...addedItems.values());
            }, true);
            return array;
        }
        /**
         * Works similar to `Array::includes()`. The difference is that it returns a readonly `ReactivePrimitive<boolean>` containing the result and is updated as the original array is updated. If you don't want this behavior, use `ReactiveArray.prototype.value.includes()` for a plain boolean instead.
         */
        includes(...args) {
            return this.pipe(() => this.#value.includes(...args));
        }
    }

    function reactive(initialValue, options = {}) {
        if (isReactive(initialValue)) {
            return initialValue;
        }
        const { parent } = options;
        let ref;
        if (isObject(initialValue)) {
            if (Array.isArray(initialValue)) {
                ref = new ReactiveArray(...initialValue);
            }
            else if (initialValue instanceof Promise) {
                const temp = new ReactivePrimitive(options.fallback);
                void initialValue.then(value => temp.value = value);
                ref = temp;
            }
            else if (isSpecialCaseObject(initialValue)) {
                ref = new ReactivePrimitive(initialValue);
            }
            else {
                // reactiveObjects don't get callbacks bound to them: the callbacks are attached to each field separately.
                return reactiveObject(initialValue, options.parent);
            }
        }
        else {
            ref = new ReactivePrimitive(initialValue);
        }
        if (parent) {
            ref.bind(() => parent.update());
        }
        return ref;
    }

    const xmlDocument = new DOMParser().parseFromString(`<xml
    xmlns="http://www.w3.org/1999/xhtml"
    xmlns:on="p:u"
    xmlns:prop="p:u"
    xmlns:call="p:u"
    xmlns:destiny="p:u"
  />`, "application/xhtml+xml");
    const xmlRange = xmlDocument.createRange();
    const xmlRoot = xmlDocument.querySelector("xml");
    xmlRange.setStart(xmlRoot, 0);
    xmlRange.setEnd(xmlRoot, 0);
    function parseString(string, parser) {
        const templateElement = document.createElement("template");
        if (parser === "html") {
            templateElement.innerHTML = string;
        }
        else {
            templateElement.content.append(xmlRange.createContextualFragment(string));
        }
        return templateElement;
    }

    /**
     * Checks if a given Node is a DOM Text node.
     * @param input The item to be checked
     */
    function isTextNode(input) {
        return input.nodeType === Node.TEXT_NODE;
    }

    /**
     * Checks if a given node is a DOM HTMLElement.
     * @param input The item to be checked
     */
    function isElement(input) {
        return input.nodeType === Node.ELEMENT_NODE;
    }

    function createPlaceholder(index) {
        const placeholder = document.createElement("template");
        placeholder.setAttribute("destiny:content", String(index));
        return placeholder;
    }
    /**
     * Replaces string markers marking content slots with placeholder elements that are marked with the `destiny:content` attribute so they can be easily replaced when hooking up content values.
     * @param contentSlots Descriptions of where the string markers are located
     */
    function prepareContentSlots(contentSlots) {
        contentSlots.forEach(contentSlot => {
            const raw = contentSlot.node.textContent ?? "";
            const nodes = contentSlot.slots.flatMap((slot, i, a) => [
                new Text(raw.slice(a[i - 1]?.end ?? 0, slot.start)),
                createPlaceholder(slot.index),
            ]);
            contentSlot.node.replaceWith(...nodes, new Text(raw.slice(contentSlot.slots.pop()?.end)));
        });
    }

    /**
     * Figures out from a freshly parsed `HTMLTemplate` where slots are located so they can be quickly hooked up with values.
     * @param template the template element to be processed
     */
    function resolveSlots(template) {
        const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        const contentSlots = [];
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (isTextNode(node)) {
                const matches = node.wholeText.matchAll(/__internal_([0-9]+)_/gu);
                const fragment = {
                    node,
                    slots: [...matches].map((match) => ({
                        index: Number(match[1]),
                        start: match.index,
                        end: match.index + match[0].length,
                    })),
                };
                if (fragment.slots.length) {
                    contentSlots.push(fragment);
                }
            }
            else if (isElement(node)) {
                for (const { value } of node.attributes) {
                    if (value.includes("__internal_")) {
                        node.setAttribute("destiny:attr", "");
                    }
                }
            }
        }
        prepareContentSlots(contentSlots);
    }

    function isDestinyElement(input) {
        return (Boolean(input) &&
            typeof input === "function" &&
            Object.prototype.isPrototypeOf.call(DestinyElement, input));
    }

    class DestinyFallback extends DestinyElement {
        constructor() {
            super();
            this.forwardProps = new Ref();
            this.template = xml `
    Loading...
  `;
            queueMicrotask(async () => {
                const module = await this.assignedData.prop.get("for");
                const component = Object.values(module).shift();
                if (!component || !isDestinyElement(component)) {
                    throw new Error(`Invalid component constructor ${String(component)}`);
                }
                this.replaceWith(xml `
          <${component}
            destiny:ref="${this.forwardProps}"
            call:append="${[...this.childNodes]}"
          />
        `.content);
            });
        }
    }
    DestinyFallback.captureProps = true;

    /**
     * Parses and processes a `TemplateStringsArray` into a `DocumentFragment`.
     * @param param0 The template strings to parse and process
     */
    function createTemplate([first, ...strings], props, parser) {
        let string = first;
        const tagProps = new Map();
        for (const [i, fragment] of strings.entries()) {
            const prop = props[i];
            if (string.endsWith("<")) {
                tagProps.set(i, prop);
                if (isDestinyElement(prop) && prop.captureProps) {
                    string += `${prop.register()} data-capture-props="true"${fragment}`;
                }
                else if (prop instanceof Promise) {
                    string += `${DestinyFallback.register()} prop:for="__internal_${i}_" data-capture-props="true"${fragment}`;
                }
                else {
                    string += String(prop) + fragment;
                }
            }
            else if (string.endsWith("</")) {
                tagProps.set(i, prop);
                if (prop instanceof Promise) {
                    string += DestinyFallback.register() + fragment;
                }
                else {
                    string += String(prop) + fragment;
                }
            }
            else {
                string += `__internal_${i}_${fragment}`;
            }
        }
        const templateElement = parseString(string, parser);
        resolveSlots(templateElement);
        return [templateElement, tagProps];
    }

    /** Used to cache parsed `DocumentFragment`s so looped templates don't need to be reparsed on each iteration. */
    const templateCache = new WeakMap();
    function getFromCache(key, set, props) {
        const template = templateCache.get(key);
        if (!template) {
            const newTemplate = set();
            templateCache.set(key, newTemplate);
            return newTemplate[0];
        }
        else {
            // Check if any of the tags differ from the cache, because they can't be slotted
            for (const [k, v] of template[1]) {
                if (props[k] !== v)
                    return set()[0];
            }
            return template[0];
        }
    }
    function parser(strings, props, parser) {
        const template = getFromCache(strings, () => createTemplate(strings, props, parser), props);
        return new TemplateResult(template, props);
    }

    /**
     * Parses an XML template into a `TemplateResult` and hooks up reactivity logic to keep the view synchronized with the state of the reactive items prived in the slots.
     * @param strings The straing parts of the template
     * @param props The slotted values in the template
     */
    function xml(strings, ...props) {
        return parser(strings, props, "xml");
    }

    // these aren't really private, but nor are they really useful to document

    /**
     * @private
     */
    class LuxonError extends Error {}

    /**
     * @private
     */
    class InvalidDateTimeError extends LuxonError {
      constructor(reason) {
        super(`Invalid DateTime: ${reason.toMessage()}`);
      }
    }

    /**
     * @private
     */
    class InvalidIntervalError extends LuxonError {
      constructor(reason) {
        super(`Invalid Interval: ${reason.toMessage()}`);
      }
    }

    /**
     * @private
     */
    class InvalidDurationError extends LuxonError {
      constructor(reason) {
        super(`Invalid Duration: ${reason.toMessage()}`);
      }
    }

    /**
     * @private
     */
    class ConflictingSpecificationError extends LuxonError {}

    /**
     * @private
     */
    class InvalidUnitError extends LuxonError {
      constructor(unit) {
        super(`Invalid unit ${unit}`);
      }
    }

    /**
     * @private
     */
    class InvalidArgumentError extends LuxonError {}

    /**
     * @private
     */
    class ZoneIsAbstractError extends LuxonError {
      constructor() {
        super("Zone is an abstract class");
      }
    }

    /**
     * @private
     */

    const n = "numeric",
      s = "short",
      l = "long";

    const DATE_SHORT = {
      year: n,
      month: n,
      day: n
    };

    const DATE_MED = {
      year: n,
      month: s,
      day: n
    };

    const DATE_MED_WITH_WEEKDAY = {
      year: n,
      month: s,
      day: n,
      weekday: s
    };

    const DATE_FULL = {
      year: n,
      month: l,
      day: n
    };

    const DATE_HUGE = {
      year: n,
      month: l,
      day: n,
      weekday: l
    };

    const TIME_SIMPLE = {
      hour: n,
      minute: n
    };

    const TIME_WITH_SECONDS = {
      hour: n,
      minute: n,
      second: n
    };

    const TIME_WITH_SHORT_OFFSET = {
      hour: n,
      minute: n,
      second: n,
      timeZoneName: s
    };

    const TIME_WITH_LONG_OFFSET = {
      hour: n,
      minute: n,
      second: n,
      timeZoneName: l
    };

    const TIME_24_SIMPLE = {
      hour: n,
      minute: n,
      hour12: false
    };

    /**
     * {@link toLocaleString}; format like '09:30:23', always 24-hour.
     */
    const TIME_24_WITH_SECONDS = {
      hour: n,
      minute: n,
      second: n,
      hour12: false
    };

    /**
     * {@link toLocaleString}; format like '09:30:23 EDT', always 24-hour.
     */
    const TIME_24_WITH_SHORT_OFFSET = {
      hour: n,
      minute: n,
      second: n,
      hour12: false,
      timeZoneName: s
    };

    /**
     * {@link toLocaleString}; format like '09:30:23 Eastern Daylight Time', always 24-hour.
     */
    const TIME_24_WITH_LONG_OFFSET = {
      hour: n,
      minute: n,
      second: n,
      hour12: false,
      timeZoneName: l
    };

    /**
     * {@link toLocaleString}; format like '10/14/1983, 9:30 AM'. Only 12-hour if the locale is.
     */
    const DATETIME_SHORT = {
      year: n,
      month: n,
      day: n,
      hour: n,
      minute: n
    };

    /**
     * {@link toLocaleString}; format like '10/14/1983, 9:30:33 AM'. Only 12-hour if the locale is.
     */
    const DATETIME_SHORT_WITH_SECONDS = {
      year: n,
      month: n,
      day: n,
      hour: n,
      minute: n,
      second: n
    };

    const DATETIME_MED = {
      year: n,
      month: s,
      day: n,
      hour: n,
      minute: n
    };

    const DATETIME_MED_WITH_SECONDS = {
      year: n,
      month: s,
      day: n,
      hour: n,
      minute: n,
      second: n
    };

    const DATETIME_MED_WITH_WEEKDAY = {
      year: n,
      month: s,
      day: n,
      weekday: s,
      hour: n,
      minute: n
    };

    const DATETIME_FULL = {
      year: n,
      month: l,
      day: n,
      hour: n,
      minute: n,
      timeZoneName: s
    };

    const DATETIME_FULL_WITH_SECONDS = {
      year: n,
      month: l,
      day: n,
      hour: n,
      minute: n,
      second: n,
      timeZoneName: s
    };

    const DATETIME_HUGE = {
      year: n,
      month: l,
      day: n,
      weekday: l,
      hour: n,
      minute: n,
      timeZoneName: l
    };

    const DATETIME_HUGE_WITH_SECONDS = {
      year: n,
      month: l,
      day: n,
      weekday: l,
      hour: n,
      minute: n,
      second: n,
      timeZoneName: l
    };

    /*
      This is just a junk drawer, containing anything used across multiple classes.
      Because Luxon is small(ish), this should stay small and we won't worry about splitting
      it up into, say, parsingUtil.js and basicUtil.js and so on. But they are divided up by feature area.
    */

    /**
     * @private
     */

    // TYPES

    function isUndefined(o) {
      return typeof o === "undefined";
    }

    function isNumber(o) {
      return typeof o === "number";
    }

    function isInteger(o) {
      return typeof o === "number" && o % 1 === 0;
    }

    function isString(o) {
      return typeof o === "string";
    }

    function isDate(o) {
      return Object.prototype.toString.call(o) === "[object Date]";
    }

    // CAPABILITIES

    function hasIntl() {
      try {
        return typeof Intl !== "undefined" && Intl.DateTimeFormat;
      } catch (e) {
        return false;
      }
    }

    function hasFormatToParts() {
      return !isUndefined(Intl.DateTimeFormat.prototype.formatToParts);
    }

    function hasRelative() {
      try {
        return typeof Intl !== "undefined" && !!Intl.RelativeTimeFormat;
      } catch (e) {
        return false;
      }
    }

    // OBJECTS AND ARRAYS

    function maybeArray(thing) {
      return Array.isArray(thing) ? thing : [thing];
    }

    function bestBy(arr, by, compare) {
      if (arr.length === 0) {
        return undefined;
      }
      return arr.reduce((best, next) => {
        const pair = [by(next), next];
        if (!best) {
          return pair;
        } else if (compare(best[0], pair[0]) === best[0]) {
          return best;
        } else {
          return pair;
        }
      }, null)[1];
    }

    function pick(obj, keys) {
      return keys.reduce((a, k) => {
        a[k] = obj[k];
        return a;
      }, {});
    }

    function hasOwnProperty(obj, prop) {
      return Object.prototype.hasOwnProperty.call(obj, prop);
    }

    // NUMBERS AND STRINGS

    function integerBetween(thing, bottom, top) {
      return isInteger(thing) && thing >= bottom && thing <= top;
    }

    // x % n but takes the sign of n instead of x
    function floorMod(x, n) {
      return x - n * Math.floor(x / n);
    }

    function padStart(input, n = 2) {
      const minus = input < 0 ? "-" : "";
      const target = minus ? input * -1 : input;
      let result;

      if (target.toString().length < n) {
        result = ("0".repeat(n) + target).slice(-n);
      } else {
        result = target.toString();
      }

      return `${minus}${result}`;
    }

    function parseInteger(string) {
      if (isUndefined(string) || string === null || string === "") {
        return undefined;
      } else {
        return parseInt(string, 10);
      }
    }

    function parseMillis(fraction) {
      // Return undefined (instead of 0) in these cases, where fraction is not set
      if (isUndefined(fraction) || fraction === null || fraction === "") {
        return undefined;
      } else {
        const f = parseFloat("0." + fraction) * 1000;
        return Math.floor(f);
      }
    }

    function roundTo(number, digits, towardZero = false) {
      const factor = 10 ** digits,
        rounder = towardZero ? Math.trunc : Math.round;
      return rounder(number * factor) / factor;
    }

    // DATE BASICS

    function isLeapYear(year) {
      return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    }

    function daysInYear(year) {
      return isLeapYear(year) ? 366 : 365;
    }

    function daysInMonth(year, month) {
      const modMonth = floorMod(month - 1, 12) + 1,
        modYear = year + (month - modMonth) / 12;

      if (modMonth === 2) {
        return isLeapYear(modYear) ? 29 : 28;
      } else {
        return [31, null, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][modMonth - 1];
      }
    }

    // covert a calendar object to a local timestamp (epoch, but with the offset baked in)
    function objToLocalTS(obj) {
      let d = Date.UTC(
        obj.year,
        obj.month - 1,
        obj.day,
        obj.hour,
        obj.minute,
        obj.second,
        obj.millisecond
      );

      // for legacy reasons, years between 0 and 99 are interpreted as 19XX; revert that
      if (obj.year < 100 && obj.year >= 0) {
        d = new Date(d);
        d.setUTCFullYear(d.getUTCFullYear() - 1900);
      }
      return +d;
    }

    function weeksInWeekYear(weekYear) {
      const p1 =
          (weekYear +
            Math.floor(weekYear / 4) -
            Math.floor(weekYear / 100) +
            Math.floor(weekYear / 400)) %
          7,
        last = weekYear - 1,
        p2 = (last + Math.floor(last / 4) - Math.floor(last / 100) + Math.floor(last / 400)) % 7;
      return p1 === 4 || p2 === 3 ? 53 : 52;
    }

    function untruncateYear(year) {
      if (year > 99) {
        return year;
      } else return year > 60 ? 1900 + year : 2000 + year;
    }

    // PARSING

    function parseZoneInfo(ts, offsetFormat, locale, timeZone = null) {
      const date = new Date(ts),
        intlOpts = {
          hour12: false,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        };

      if (timeZone) {
        intlOpts.timeZone = timeZone;
      }

      const modified = Object.assign({ timeZoneName: offsetFormat }, intlOpts),
        intl = hasIntl();

      if (intl && hasFormatToParts()) {
        const parsed = new Intl.DateTimeFormat(locale, modified)
          .formatToParts(date)
          .find(m => m.type.toLowerCase() === "timezonename");
        return parsed ? parsed.value : null;
      } else if (intl) {
        // this probably doesn't work for all locales
        const without = new Intl.DateTimeFormat(locale, intlOpts).format(date),
          included = new Intl.DateTimeFormat(locale, modified).format(date),
          diffed = included.substring(without.length),
          trimmed = diffed.replace(/^[, \u200e]+/, "");
        return trimmed;
      } else {
        return null;
      }
    }

    // signedOffset('-5', '30') -> -330
    function signedOffset(offHourStr, offMinuteStr) {
      let offHour = parseInt(offHourStr, 10);

      // don't || this because we want to preserve -0
      if (Number.isNaN(offHour)) {
        offHour = 0;
      }

      const offMin = parseInt(offMinuteStr, 10) || 0,
        offMinSigned = offHour < 0 || Object.is(offHour, -0) ? -offMin : offMin;
      return offHour * 60 + offMinSigned;
    }

    // COERCION

    function asNumber(value) {
      const numericValue = Number(value);
      if (typeof value === "boolean" || value === "" || Number.isNaN(numericValue))
        throw new InvalidArgumentError(`Invalid unit value ${value}`);
      return numericValue;
    }

    function normalizeObject(obj, normalizer, nonUnitKeys) {
      const normalized = {};
      for (const u in obj) {
        if (hasOwnProperty(obj, u)) {
          if (nonUnitKeys.indexOf(u) >= 0) continue;
          const v = obj[u];
          if (v === undefined || v === null) continue;
          normalized[normalizer(u)] = asNumber(v);
        }
      }
      return normalized;
    }

    function formatOffset(offset, format) {
      const hours = Math.trunc(Math.abs(offset / 60)),
        minutes = Math.trunc(Math.abs(offset % 60)),
        sign = offset >= 0 ? "+" : "-";

      switch (format) {
        case "short":
          return `${sign}${padStart(hours, 2)}:${padStart(minutes, 2)}`;
        case "narrow":
          return `${sign}${hours}${minutes > 0 ? `:${minutes}` : ""}`;
        case "techie":
          return `${sign}${padStart(hours, 2)}${padStart(minutes, 2)}`;
        default:
          throw new RangeError(`Value format ${format} is out of range for property format`);
      }
    }

    function timeObject(obj) {
      return pick(obj, ["hour", "minute", "second", "millisecond"]);
    }

    const ianaRegex = /[A-Za-z_+-]{1,256}(:?\/[A-Za-z_+-]{1,256}(\/[A-Za-z_+-]{1,256})?)?/;

    function stringify(obj) {
      return JSON.stringify(obj, Object.keys(obj).sort());
    }

    /**
     * @private
     */

    const monthsLong = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];

    const monthsShort = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec"
    ];

    const monthsNarrow = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

    function months(length) {
      switch (length) {
        case "narrow":
          return monthsNarrow;
        case "short":
          return monthsShort;
        case "long":
          return monthsLong;
        case "numeric":
          return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
        case "2-digit":
          return ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
        default:
          return null;
      }
    }

    const weekdaysLong = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday"
    ];

    const weekdaysShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const weekdaysNarrow = ["M", "T", "W", "T", "F", "S", "S"];

    function weekdays(length) {
      switch (length) {
        case "narrow":
          return weekdaysNarrow;
        case "short":
          return weekdaysShort;
        case "long":
          return weekdaysLong;
        case "numeric":
          return ["1", "2", "3", "4", "5", "6", "7"];
        default:
          return null;
      }
    }

    const meridiems = ["AM", "PM"];

    const erasLong = ["Before Christ", "Anno Domini"];

    const erasShort = ["BC", "AD"];

    const erasNarrow = ["B", "A"];

    function eras(length) {
      switch (length) {
        case "narrow":
          return erasNarrow;
        case "short":
          return erasShort;
        case "long":
          return erasLong;
        default:
          return null;
      }
    }

    function meridiemForDateTime(dt) {
      return meridiems[dt.hour < 12 ? 0 : 1];
    }

    function weekdayForDateTime(dt, length) {
      return weekdays(length)[dt.weekday - 1];
    }

    function monthForDateTime(dt, length) {
      return months(length)[dt.month - 1];
    }

    function eraForDateTime(dt, length) {
      return eras(length)[dt.year < 0 ? 0 : 1];
    }

    function formatRelativeTime(unit, count, numeric = "always", narrow = false) {
      const units = {
        years: ["year", "yr."],
        quarters: ["quarter", "qtr."],
        months: ["month", "mo."],
        weeks: ["week", "wk."],
        days: ["day", "day", "days"],
        hours: ["hour", "hr."],
        minutes: ["minute", "min."],
        seconds: ["second", "sec."]
      };

      const lastable = ["hours", "minutes", "seconds"].indexOf(unit) === -1;

      if (numeric === "auto" && lastable) {
        const isDay = unit === "days";
        switch (count) {
          case 1:
            return isDay ? "tomorrow" : `next ${units[unit][0]}`;
          case -1:
            return isDay ? "yesterday" : `last ${units[unit][0]}`;
          case 0:
            return isDay ? "today" : `this ${units[unit][0]}`;
        }
      }

      const isInPast = Object.is(count, -0) || count < 0,
        fmtValue = Math.abs(count),
        singular = fmtValue === 1,
        lilUnits = units[unit],
        fmtUnit = narrow
          ? singular
            ? lilUnits[1]
            : lilUnits[2] || lilUnits[1]
          : singular
            ? units[unit][0]
            : unit;
      return isInPast ? `${fmtValue} ${fmtUnit} ago` : `in ${fmtValue} ${fmtUnit}`;
    }

    function formatString(knownFormat) {
      // these all have the offsets removed because we don't have access to them
      // without all the intl stuff this is backfilling
      const filtered = pick(knownFormat, [
          "weekday",
          "era",
          "year",
          "month",
          "day",
          "hour",
          "minute",
          "second",
          "timeZoneName",
          "hour12"
        ]),
        key = stringify(filtered),
        dateTimeHuge = "EEEE, LLLL d, yyyy, h:mm a";
      switch (key) {
        case stringify(DATE_SHORT):
          return "M/d/yyyy";
        case stringify(DATE_MED):
          return "LLL d, yyyy";
        case stringify(DATE_MED_WITH_WEEKDAY):
          return "EEE, LLL d, yyyy";
        case stringify(DATE_FULL):
          return "LLLL d, yyyy";
        case stringify(DATE_HUGE):
          return "EEEE, LLLL d, yyyy";
        case stringify(TIME_SIMPLE):
          return "h:mm a";
        case stringify(TIME_WITH_SECONDS):
          return "h:mm:ss a";
        case stringify(TIME_WITH_SHORT_OFFSET):
          return "h:mm a";
        case stringify(TIME_WITH_LONG_OFFSET):
          return "h:mm a";
        case stringify(TIME_24_SIMPLE):
          return "HH:mm";
        case stringify(TIME_24_WITH_SECONDS):
          return "HH:mm:ss";
        case stringify(TIME_24_WITH_SHORT_OFFSET):
          return "HH:mm";
        case stringify(TIME_24_WITH_LONG_OFFSET):
          return "HH:mm";
        case stringify(DATETIME_SHORT):
          return "M/d/yyyy, h:mm a";
        case stringify(DATETIME_MED):
          return "LLL d, yyyy, h:mm a";
        case stringify(DATETIME_FULL):
          return "LLLL d, yyyy, h:mm a";
        case stringify(DATETIME_HUGE):
          return dateTimeHuge;
        case stringify(DATETIME_SHORT_WITH_SECONDS):
          return "M/d/yyyy, h:mm:ss a";
        case stringify(DATETIME_MED_WITH_SECONDS):
          return "LLL d, yyyy, h:mm:ss a";
        case stringify(DATETIME_MED_WITH_WEEKDAY):
          return "EEE, d LLL yyyy, h:mm a";
        case stringify(DATETIME_FULL_WITH_SECONDS):
          return "LLLL d, yyyy, h:mm:ss a";
        case stringify(DATETIME_HUGE_WITH_SECONDS):
          return "EEEE, LLLL d, yyyy, h:mm:ss a";
        default:
          return dateTimeHuge;
      }
    }

    function stringifyTokens(splits, tokenToString) {
      let s = "";
      for (const token of splits) {
        if (token.literal) {
          s += token.val;
        } else {
          s += tokenToString(token.val);
        }
      }
      return s;
    }

    const macroTokenToFormatOpts = {
      D: DATE_SHORT,
      DD: DATE_MED,
      DDD: DATE_FULL,
      DDDD: DATE_HUGE,
      t: TIME_SIMPLE,
      tt: TIME_WITH_SECONDS,
      ttt: TIME_WITH_SHORT_OFFSET,
      tttt: TIME_WITH_LONG_OFFSET,
      T: TIME_24_SIMPLE,
      TT: TIME_24_WITH_SECONDS,
      TTT: TIME_24_WITH_SHORT_OFFSET,
      TTTT: TIME_24_WITH_LONG_OFFSET,
      f: DATETIME_SHORT,
      ff: DATETIME_MED,
      fff: DATETIME_FULL,
      ffff: DATETIME_HUGE,
      F: DATETIME_SHORT_WITH_SECONDS,
      FF: DATETIME_MED_WITH_SECONDS,
      FFF: DATETIME_FULL_WITH_SECONDS,
      FFFF: DATETIME_HUGE_WITH_SECONDS
    };

    /**
     * @private
     */

    class Formatter {
      static create(locale, opts = {}) {
        return new Formatter(locale, opts);
      }

      static parseFormat(fmt) {
        let current = null,
          currentFull = "",
          bracketed = false;
        const splits = [];
        for (let i = 0; i < fmt.length; i++) {
          const c = fmt.charAt(i);
          if (c === "'") {
            if (currentFull.length > 0) {
              splits.push({ literal: bracketed, val: currentFull });
            }
            current = null;
            currentFull = "";
            bracketed = !bracketed;
          } else if (bracketed) {
            currentFull += c;
          } else if (c === current) {
            currentFull += c;
          } else {
            if (currentFull.length > 0) {
              splits.push({ literal: false, val: currentFull });
            }
            currentFull = c;
            current = c;
          }
        }

        if (currentFull.length > 0) {
          splits.push({ literal: bracketed, val: currentFull });
        }

        return splits;
      }

      static macroTokenToFormatOpts(token) {
        return macroTokenToFormatOpts[token];
      }

      constructor(locale, formatOpts) {
        this.opts = formatOpts;
        this.loc = locale;
        this.systemLoc = null;
      }

      formatWithSystemDefault(dt, opts) {
        if (this.systemLoc === null) {
          this.systemLoc = this.loc.redefaultToSystem();
        }
        const df = this.systemLoc.dtFormatter(dt, Object.assign({}, this.opts, opts));
        return df.format();
      }

      formatDateTime(dt, opts = {}) {
        const df = this.loc.dtFormatter(dt, Object.assign({}, this.opts, opts));
        return df.format();
      }

      formatDateTimeParts(dt, opts = {}) {
        const df = this.loc.dtFormatter(dt, Object.assign({}, this.opts, opts));
        return df.formatToParts();
      }

      resolvedOptions(dt, opts = {}) {
        const df = this.loc.dtFormatter(dt, Object.assign({}, this.opts, opts));
        return df.resolvedOptions();
      }

      num(n, p = 0) {
        // we get some perf out of doing this here, annoyingly
        if (this.opts.forceSimple) {
          return padStart(n, p);
        }

        const opts = Object.assign({}, this.opts);

        if (p > 0) {
          opts.padTo = p;
        }

        return this.loc.numberFormatter(opts).format(n);
      }

      formatDateTimeFromString(dt, fmt) {
        const knownEnglish = this.loc.listingMode() === "en",
          useDateTimeFormatter =
            this.loc.outputCalendar && this.loc.outputCalendar !== "gregory" && hasFormatToParts(),
          string = (opts, extract) => this.loc.extract(dt, opts, extract),
          formatOffset = opts => {
            if (dt.isOffsetFixed && dt.offset === 0 && opts.allowZ) {
              return "Z";
            }

            return dt.isValid ? dt.zone.formatOffset(dt.ts, opts.format) : "";
          },
          meridiem = () =>
            knownEnglish
              ? meridiemForDateTime(dt)
              : string({ hour: "numeric", hour12: true }, "dayperiod"),
          month = (length, standalone) =>
            knownEnglish
              ? monthForDateTime(dt, length)
              : string(standalone ? { month: length } : { month: length, day: "numeric" }, "month"),
          weekday = (length, standalone) =>
            knownEnglish
              ? weekdayForDateTime(dt, length)
              : string(
                  standalone ? { weekday: length } : { weekday: length, month: "long", day: "numeric" },
                  "weekday"
                ),
          maybeMacro = token => {
            const formatOpts = Formatter.macroTokenToFormatOpts(token);
            if (formatOpts) {
              return this.formatWithSystemDefault(dt, formatOpts);
            } else {
              return token;
            }
          },
          era = length =>
            knownEnglish ? eraForDateTime(dt, length) : string({ era: length }, "era"),
          tokenToString = token => {
            // Where possible: http://cldr.unicode.org/translation/date-time-1/date-time#TOC-Standalone-vs.-Format-Styles
            switch (token) {
              // ms
              case "S":
                return this.num(dt.millisecond);
              case "u":
              // falls through
              case "SSS":
                return this.num(dt.millisecond, 3);
              // seconds
              case "s":
                return this.num(dt.second);
              case "ss":
                return this.num(dt.second, 2);
              // minutes
              case "m":
                return this.num(dt.minute);
              case "mm":
                return this.num(dt.minute, 2);
              // hours
              case "h":
                return this.num(dt.hour % 12 === 0 ? 12 : dt.hour % 12);
              case "hh":
                return this.num(dt.hour % 12 === 0 ? 12 : dt.hour % 12, 2);
              case "H":
                return this.num(dt.hour);
              case "HH":
                return this.num(dt.hour, 2);
              // offset
              case "Z":
                // like +6
                return formatOffset({ format: "narrow", allowZ: this.opts.allowZ });
              case "ZZ":
                // like +06:00
                return formatOffset({ format: "short", allowZ: this.opts.allowZ });
              case "ZZZ":
                // like +0600
                return formatOffset({ format: "techie", allowZ: this.opts.allowZ });
              case "ZZZZ":
                // like EST
                return dt.zone.offsetName(dt.ts, { format: "short", locale: this.loc.locale });
              case "ZZZZZ":
                // like Eastern Standard Time
                return dt.zone.offsetName(dt.ts, { format: "long", locale: this.loc.locale });
              // zone
              case "z":
                // like America/New_York
                return dt.zoneName;
              // meridiems
              case "a":
                return meridiem();
              // dates
              case "d":
                return useDateTimeFormatter ? string({ day: "numeric" }, "day") : this.num(dt.day);
              case "dd":
                return useDateTimeFormatter ? string({ day: "2-digit" }, "day") : this.num(dt.day, 2);
              // weekdays - standalone
              case "c":
                // like 1
                return this.num(dt.weekday);
              case "ccc":
                // like 'Tues'
                return weekday("short", true);
              case "cccc":
                // like 'Tuesday'
                return weekday("long", true);
              case "ccccc":
                // like 'T'
                return weekday("narrow", true);
              // weekdays - format
              case "E":
                // like 1
                return this.num(dt.weekday);
              case "EEE":
                // like 'Tues'
                return weekday("short", false);
              case "EEEE":
                // like 'Tuesday'
                return weekday("long", false);
              case "EEEEE":
                // like 'T'
                return weekday("narrow", false);
              // months - standalone
              case "L":
                // like 1
                return useDateTimeFormatter
                  ? string({ month: "numeric", day: "numeric" }, "month")
                  : this.num(dt.month);
              case "LL":
                // like 01, doesn't seem to work
                return useDateTimeFormatter
                  ? string({ month: "2-digit", day: "numeric" }, "month")
                  : this.num(dt.month, 2);
              case "LLL":
                // like Jan
                return month("short", true);
              case "LLLL":
                // like January
                return month("long", true);
              case "LLLLL":
                // like J
                return month("narrow", true);
              // months - format
              case "M":
                // like 1
                return useDateTimeFormatter
                  ? string({ month: "numeric" }, "month")
                  : this.num(dt.month);
              case "MM":
                // like 01
                return useDateTimeFormatter
                  ? string({ month: "2-digit" }, "month")
                  : this.num(dt.month, 2);
              case "MMM":
                // like Jan
                return month("short", false);
              case "MMMM":
                // like January
                return month("long", false);
              case "MMMMM":
                // like J
                return month("narrow", false);
              // years
              case "y":
                // like 2014
                return useDateTimeFormatter ? string({ year: "numeric" }, "year") : this.num(dt.year);
              case "yy":
                // like 14
                return useDateTimeFormatter
                  ? string({ year: "2-digit" }, "year")
                  : this.num(dt.year.toString().slice(-2), 2);
              case "yyyy":
                // like 0012
                return useDateTimeFormatter
                  ? string({ year: "numeric" }, "year")
                  : this.num(dt.year, 4);
              case "yyyyyy":
                // like 000012
                return useDateTimeFormatter
                  ? string({ year: "numeric" }, "year")
                  : this.num(dt.year, 6);
              // eras
              case "G":
                // like AD
                return era("short");
              case "GG":
                // like Anno Domini
                return era("long");
              case "GGGGG":
                return era("narrow");
              case "kk":
                return this.num(dt.weekYear.toString().slice(-2), 2);
              case "kkkk":
                return this.num(dt.weekYear, 4);
              case "W":
                return this.num(dt.weekNumber);
              case "WW":
                return this.num(dt.weekNumber, 2);
              case "o":
                return this.num(dt.ordinal);
              case "ooo":
                return this.num(dt.ordinal, 3);
              case "q":
                // like 1
                return this.num(dt.quarter);
              case "qq":
                // like 01
                return this.num(dt.quarter, 2);
              case "X":
                return this.num(Math.floor(dt.ts / 1000));
              case "x":
                return this.num(dt.ts);
              default:
                return maybeMacro(token);
            }
          };

        return stringifyTokens(Formatter.parseFormat(fmt), tokenToString);
      }

      formatDurationFromString(dur, fmt) {
        const tokenToField = token => {
            switch (token[0]) {
              case "S":
                return "millisecond";
              case "s":
                return "second";
              case "m":
                return "minute";
              case "h":
                return "hour";
              case "d":
                return "day";
              case "M":
                return "month";
              case "y":
                return "year";
              default:
                return null;
            }
          },
          tokenToString = lildur => token => {
            const mapped = tokenToField(token);
            if (mapped) {
              return this.num(lildur.get(mapped), token.length);
            } else {
              return token;
            }
          },
          tokens = Formatter.parseFormat(fmt),
          realTokens = tokens.reduce(
            (found, { literal, val }) => (literal ? found : found.concat(val)),
            []
          ),
          collapsed = dur.shiftTo(...realTokens.map(tokenToField).filter(t => t));
        return stringifyTokens(tokens, tokenToString(collapsed));
      }
    }

    class Invalid {
      constructor(reason, explanation) {
        this.reason = reason;
        this.explanation = explanation;
      }

      toMessage() {
        if (this.explanation) {
          return `${this.reason}: ${this.explanation}`;
        } else {
          return this.reason;
        }
      }
    }

    /* eslint no-unused-vars: "off" */

    /**
     * @interface
     */
    class Zone {
      /**
       * The type of zone
       * @abstract
       * @type {string}
       */
      get type() {
        throw new ZoneIsAbstractError();
      }

      /**
       * The name of this zone.
       * @abstract
       * @type {string}
       */
      get name() {
        throw new ZoneIsAbstractError();
      }

      /**
       * Returns whether the offset is known to be fixed for the whole year.
       * @abstract
       * @type {boolean}
       */
      get universal() {
        throw new ZoneIsAbstractError();
      }

      /**
       * Returns the offset's common name (such as EST) at the specified timestamp
       * @abstract
       * @param {number} ts - Epoch milliseconds for which to get the name
       * @param {Object} opts - Options to affect the format
       * @param {string} opts.format - What style of offset to return. Accepts 'long' or 'short'.
       * @param {string} opts.locale - What locale to return the offset name in.
       * @return {string}
       */
      offsetName(ts, opts) {
        throw new ZoneIsAbstractError();
      }

      /**
       * Returns the offset's value as a string
       * @abstract
       * @param {number} ts - Epoch milliseconds for which to get the offset
       * @param {string} format - What style of offset to return.
       *                          Accepts 'narrow', 'short', or 'techie'. Returning '+6', '+06:00', or '+0600' respectively
       * @return {string}
       */
      formatOffset(ts, format) {
        throw new ZoneIsAbstractError();
      }

      /**
       * Return the offset in minutes for this zone at the specified timestamp.
       * @abstract
       * @param {number} ts - Epoch milliseconds for which to compute the offset
       * @return {number}
       */
      offset(ts) {
        throw new ZoneIsAbstractError();
      }

      /**
       * Return whether this Zone is equal to another zone
       * @abstract
       * @param {Zone} otherZone - the zone to compare
       * @return {boolean}
       */
      equals(otherZone) {
        throw new ZoneIsAbstractError();
      }

      /**
       * Return whether this Zone is valid.
       * @abstract
       * @type {boolean}
       */
      get isValid() {
        throw new ZoneIsAbstractError();
      }
    }

    let singleton = null;

    /**
     * Represents the local zone for this JavaScript environment.
     * @implements {Zone}
     */
    class LocalZone extends Zone {
      /**
       * Get a singleton instance of the local zone
       * @return {LocalZone}
       */
      static get instance() {
        if (singleton === null) {
          singleton = new LocalZone();
        }
        return singleton;
      }

      /** @override **/
      get type() {
        return "local";
      }

      /** @override **/
      get name() {
        if (hasIntl()) {
          return new Intl.DateTimeFormat().resolvedOptions().timeZone;
        } else return "local";
      }

      /** @override **/
      get universal() {
        return false;
      }

      /** @override **/
      offsetName(ts, { format, locale }) {
        return parseZoneInfo(ts, format, locale);
      }

      /** @override **/
      formatOffset(ts, format) {
        return formatOffset(this.offset(ts), format);
      }

      /** @override **/
      offset(ts) {
        return -new Date(ts).getTimezoneOffset();
      }

      /** @override **/
      equals(otherZone) {
        return otherZone.type === "local";
      }

      /** @override **/
      get isValid() {
        return true;
      }
    }

    const matchingRegex = RegExp(`^${ianaRegex.source}$`);

    let dtfCache = {};
    function makeDTF(zone) {
      if (!dtfCache[zone]) {
        dtfCache[zone] = new Intl.DateTimeFormat("en-US", {
          hour12: false,
          timeZone: zone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        });
      }
      return dtfCache[zone];
    }

    const typeToPos = {
      year: 0,
      month: 1,
      day: 2,
      hour: 3,
      minute: 4,
      second: 5
    };

    function hackyOffset(dtf, date) {
      const formatted = dtf.format(date).replace(/\u200E/g, ""),
        parsed = /(\d+)\/(\d+)\/(\d+),? (\d+):(\d+):(\d+)/.exec(formatted),
        [, fMonth, fDay, fYear, fHour, fMinute, fSecond] = parsed;
      return [fYear, fMonth, fDay, fHour, fMinute, fSecond];
    }

    function partsOffset(dtf, date) {
      const formatted = dtf.formatToParts(date),
        filled = [];
      for (let i = 0; i < formatted.length; i++) {
        const { type, value } = formatted[i],
          pos = typeToPos[type];

        if (!isUndefined(pos)) {
          filled[pos] = parseInt(value, 10);
        }
      }
      return filled;
    }

    let ianaZoneCache = {};
    /**
     * A zone identified by an IANA identifier, like America/New_York
     * @implements {Zone}
     */
    class IANAZone extends Zone {
      /**
       * @param {string} name - Zone name
       * @return {IANAZone}
       */
      static create(name) {
        if (!ianaZoneCache[name]) {
          ianaZoneCache[name] = new IANAZone(name);
        }
        return ianaZoneCache[name];
      }

      /**
       * Reset local caches. Should only be necessary in testing scenarios.
       * @return {void}
       */
      static resetCache() {
        ianaZoneCache = {};
        dtfCache = {};
      }

      /**
       * Returns whether the provided string is a valid specifier. This only checks the string's format, not that the specifier identifies a known zone; see isValidZone for that.
       * @param {string} s - The string to check validity on
       * @example IANAZone.isValidSpecifier("America/New_York") //=> true
       * @example IANAZone.isValidSpecifier("Fantasia/Castle") //=> true
       * @example IANAZone.isValidSpecifier("Sport~~blorp") //=> false
       * @return {boolean}
       */
      static isValidSpecifier(s) {
        return !!(s && s.match(matchingRegex));
      }

      /**
       * Returns whether the provided string identifies a real zone
       * @param {string} zone - The string to check
       * @example IANAZone.isValidZone("America/New_York") //=> true
       * @example IANAZone.isValidZone("Fantasia/Castle") //=> false
       * @example IANAZone.isValidZone("Sport~~blorp") //=> false
       * @return {boolean}
       */
      static isValidZone(zone) {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: zone }).format();
          return true;
        } catch (e) {
          return false;
        }
      }

      // Etc/GMT+8 -> -480
      /** @ignore */
      static parseGMTOffset(specifier) {
        if (specifier) {
          const match = specifier.match(/^Etc\/GMT([+-]\d{1,2})$/i);
          if (match) {
            return -60 * parseInt(match[1]);
          }
        }
        return null;
      }

      constructor(name) {
        super();
        /** @private **/
        this.zoneName = name;
        /** @private **/
        this.valid = IANAZone.isValidZone(name);
      }

      /** @override **/
      get type() {
        return "iana";
      }

      /** @override **/
      get name() {
        return this.zoneName;
      }

      /** @override **/
      get universal() {
        return false;
      }

      /** @override **/
      offsetName(ts, { format, locale }) {
        return parseZoneInfo(ts, format, locale, this.name);
      }

      /** @override **/
      formatOffset(ts, format) {
        return formatOffset(this.offset(ts), format);
      }

      /** @override **/
      offset(ts) {
        const date = new Date(ts),
          dtf = makeDTF(this.name),
          [year, month, day, hour, minute, second] = dtf.formatToParts
            ? partsOffset(dtf, date)
            : hackyOffset(dtf, date),
          // work around https://bugs.chromium.org/p/chromium/issues/detail?id=1025564&can=2&q=%2224%3A00%22%20datetimeformat
          adjustedHour = hour === 24 ? 0 : hour;

        const asUTC = objToLocalTS({
          year,
          month,
          day,
          hour: adjustedHour,
          minute,
          second,
          millisecond: 0
        });

        let asTS = +date;
        const over = asTS % 1000;
        asTS -= over >= 0 ? over : 1000 + over;
        return (asUTC - asTS) / (60 * 1000);
      }

      /** @override **/
      equals(otherZone) {
        return otherZone.type === "iana" && otherZone.name === this.name;
      }

      /** @override **/
      get isValid() {
        return this.valid;
      }
    }

    let singleton$1 = null;

    /**
     * A zone with a fixed offset (meaning no DST)
     * @implements {Zone}
     */
    class FixedOffsetZone extends Zone {
      /**
       * Get a singleton instance of UTC
       * @return {FixedOffsetZone}
       */
      static get utcInstance() {
        if (singleton$1 === null) {
          singleton$1 = new FixedOffsetZone(0);
        }
        return singleton$1;
      }

      /**
       * Get an instance with a specified offset
       * @param {number} offset - The offset in minutes
       * @return {FixedOffsetZone}
       */
      static instance(offset) {
        return offset === 0 ? FixedOffsetZone.utcInstance : new FixedOffsetZone(offset);
      }

      /**
       * Get an instance of FixedOffsetZone from a UTC offset string, like "UTC+6"
       * @param {string} s - The offset string to parse
       * @example FixedOffsetZone.parseSpecifier("UTC+6")
       * @example FixedOffsetZone.parseSpecifier("UTC+06")
       * @example FixedOffsetZone.parseSpecifier("UTC-6:00")
       * @return {FixedOffsetZone}
       */
      static parseSpecifier(s) {
        if (s) {
          const r = s.match(/^utc(?:([+-]\d{1,2})(?::(\d{2}))?)?$/i);
          if (r) {
            return new FixedOffsetZone(signedOffset(r[1], r[2]));
          }
        }
        return null;
      }

      constructor(offset) {
        super();
        /** @private **/
        this.fixed = offset;
      }

      /** @override **/
      get type() {
        return "fixed";
      }

      /** @override **/
      get name() {
        return this.fixed === 0 ? "UTC" : `UTC${formatOffset(this.fixed, "narrow")}`;
      }

      /** @override **/
      offsetName() {
        return this.name;
      }

      /** @override **/
      formatOffset(ts, format) {
        return formatOffset(this.fixed, format);
      }

      /** @override **/
      get universal() {
        return true;
      }

      /** @override **/
      offset() {
        return this.fixed;
      }

      /** @override **/
      equals(otherZone) {
        return otherZone.type === "fixed" && otherZone.fixed === this.fixed;
      }

      /** @override **/
      get isValid() {
        return true;
      }
    }

    /**
     * A zone that failed to parse. You should never need to instantiate this.
     * @implements {Zone}
     */
    class InvalidZone extends Zone {
      constructor(zoneName) {
        super();
        /**  @private */
        this.zoneName = zoneName;
      }

      /** @override **/
      get type() {
        return "invalid";
      }

      /** @override **/
      get name() {
        return this.zoneName;
      }

      /** @override **/
      get universal() {
        return false;
      }

      /** @override **/
      offsetName() {
        return null;
      }

      /** @override **/
      formatOffset() {
        return "";
      }

      /** @override **/
      offset() {
        return NaN;
      }

      /** @override **/
      equals() {
        return false;
      }

      /** @override **/
      get isValid() {
        return false;
      }
    }

    /**
     * @private
     */

    function normalizeZone(input, defaultZone) {
      let offset;
      if (isUndefined(input) || input === null) {
        return defaultZone;
      } else if (input instanceof Zone) {
        return input;
      } else if (isString(input)) {
        const lowered = input.toLowerCase();
        if (lowered === "local") return defaultZone;
        else if (lowered === "utc" || lowered === "gmt") return FixedOffsetZone.utcInstance;
        else if ((offset = IANAZone.parseGMTOffset(input)) != null) {
          // handle Etc/GMT-4, which V8 chokes on
          return FixedOffsetZone.instance(offset);
        } else if (IANAZone.isValidSpecifier(lowered)) return IANAZone.create(input);
        else return FixedOffsetZone.parseSpecifier(lowered) || new InvalidZone(input);
      } else if (isNumber(input)) {
        return FixedOffsetZone.instance(input);
      } else if (typeof input === "object" && input.offset && typeof input.offset === "number") {
        // This is dumb, but the instanceof check above doesn't seem to really work
        // so we're duck checking it
        return input;
      } else {
        return new InvalidZone(input);
      }
    }

    let now = () => Date.now(),
      defaultZone = null, // not setting this directly to LocalZone.instance bc loading order issues
      defaultLocale = null,
      defaultNumberingSystem = null,
      defaultOutputCalendar = null,
      throwOnInvalid = false;

    /**
     * Settings contains static getters and setters that control Luxon's overall behavior. Luxon is a simple library with few options, but the ones it does have live here.
     */
    class Settings {
      /**
       * Get the callback for returning the current timestamp.
       * @type {function}
       */
      static get now() {
        return now;
      }

      /**
       * Set the callback for returning the current timestamp.
       * The function should return a number, which will be interpreted as an Epoch millisecond count
       * @type {function}
       * @example Settings.now = () => Date.now() + 3000 // pretend it is 3 seconds in the future
       * @example Settings.now = () => 0 // always pretend it's Jan 1, 1970 at midnight in UTC time
       */
      static set now(n) {
        now = n;
      }

      /**
       * Get the default time zone to create DateTimes in.
       * @type {string}
       */
      static get defaultZoneName() {
        return Settings.defaultZone.name;
      }

      /**
       * Set the default time zone to create DateTimes in. Does not affect existing instances.
       * @type {string}
       */
      static set defaultZoneName(z) {
        if (!z) {
          defaultZone = null;
        } else {
          defaultZone = normalizeZone(z);
        }
      }

      /**
       * Get the default time zone object to create DateTimes in. Does not affect existing instances.
       * @type {Zone}
       */
      static get defaultZone() {
        return defaultZone || LocalZone.instance;
      }

      /**
       * Get the default locale to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static get defaultLocale() {
        return defaultLocale;
      }

      /**
       * Set the default locale to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static set defaultLocale(locale) {
        defaultLocale = locale;
      }

      /**
       * Get the default numbering system to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static get defaultNumberingSystem() {
        return defaultNumberingSystem;
      }

      /**
       * Set the default numbering system to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static set defaultNumberingSystem(numberingSystem) {
        defaultNumberingSystem = numberingSystem;
      }

      /**
       * Get the default output calendar to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static get defaultOutputCalendar() {
        return defaultOutputCalendar;
      }

      /**
       * Set the default output calendar to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static set defaultOutputCalendar(outputCalendar) {
        defaultOutputCalendar = outputCalendar;
      }

      /**
       * Get whether Luxon will throw when it encounters invalid DateTimes, Durations, or Intervals
       * @type {boolean}
       */
      static get throwOnInvalid() {
        return throwOnInvalid;
      }

      /**
       * Set whether Luxon will throw when it encounters invalid DateTimes, Durations, or Intervals
       * @type {boolean}
       */
      static set throwOnInvalid(t) {
        throwOnInvalid = t;
      }

      /**
       * Reset Luxon's global caches. Should only be necessary in testing scenarios.
       * @return {void}
       */
      static resetCaches() {
        Locale.resetCache();
        IANAZone.resetCache();
      }
    }

    let intlDTCache = {};
    function getCachedDTF(locString, opts = {}) {
      const key = JSON.stringify([locString, opts]);
      let dtf = intlDTCache[key];
      if (!dtf) {
        dtf = new Intl.DateTimeFormat(locString, opts);
        intlDTCache[key] = dtf;
      }
      return dtf;
    }

    let intlNumCache = {};
    function getCachedINF(locString, opts = {}) {
      const key = JSON.stringify([locString, opts]);
      let inf = intlNumCache[key];
      if (!inf) {
        inf = new Intl.NumberFormat(locString, opts);
        intlNumCache[key] = inf;
      }
      return inf;
    }

    let intlRelCache = {};
    function getCachedRTF(locString, opts = {}) {
      const { base, ...cacheKeyOpts } = opts; // exclude `base` from the options
      const key = JSON.stringify([locString, cacheKeyOpts]);
      let inf = intlRelCache[key];
      if (!inf) {
        inf = new Intl.RelativeTimeFormat(locString, opts);
        intlRelCache[key] = inf;
      }
      return inf;
    }

    let sysLocaleCache = null;
    function systemLocale() {
      if (sysLocaleCache) {
        return sysLocaleCache;
      } else if (hasIntl()) {
        const computedSys = new Intl.DateTimeFormat().resolvedOptions().locale;
        // node sometimes defaults to "und". Override that because that is dumb
        sysLocaleCache = !computedSys || computedSys === "und" ? "en-US" : computedSys;
        return sysLocaleCache;
      } else {
        sysLocaleCache = "en-US";
        return sysLocaleCache;
      }
    }

    function parseLocaleString(localeStr) {
      // I really want to avoid writing a BCP 47 parser
      // see, e.g. https://github.com/wooorm/bcp-47
      // Instead, we'll do this:

      // a) if the string has no -u extensions, just leave it alone
      // b) if it does, use Intl to resolve everything
      // c) if Intl fails, try again without the -u

      const uIndex = localeStr.indexOf("-u-");
      if (uIndex === -1) {
        return [localeStr];
      } else {
        let options;
        const smaller = localeStr.substring(0, uIndex);
        try {
          options = getCachedDTF(localeStr).resolvedOptions();
        } catch (e) {
          options = getCachedDTF(smaller).resolvedOptions();
        }

        const { numberingSystem, calendar } = options;
        // return the smaller one so that we can append the calendar and numbering overrides to it
        return [smaller, numberingSystem, calendar];
      }
    }

    function intlConfigString(localeStr, numberingSystem, outputCalendar) {
      if (hasIntl()) {
        if (outputCalendar || numberingSystem) {
          localeStr += "-u";

          if (outputCalendar) {
            localeStr += `-ca-${outputCalendar}`;
          }

          if (numberingSystem) {
            localeStr += `-nu-${numberingSystem}`;
          }
          return localeStr;
        } else {
          return localeStr;
        }
      } else {
        return [];
      }
    }

    function mapMonths(f) {
      const ms = [];
      for (let i = 1; i <= 12; i++) {
        const dt = DateTime.utc(2016, i, 1);
        ms.push(f(dt));
      }
      return ms;
    }

    function mapWeekdays(f) {
      const ms = [];
      for (let i = 1; i <= 7; i++) {
        const dt = DateTime.utc(2016, 11, 13 + i);
        ms.push(f(dt));
      }
      return ms;
    }

    function listStuff(loc, length, defaultOK, englishFn, intlFn) {
      const mode = loc.listingMode(defaultOK);

      if (mode === "error") {
        return null;
      } else if (mode === "en") {
        return englishFn(length);
      } else {
        return intlFn(length);
      }
    }

    function supportsFastNumbers(loc) {
      if (loc.numberingSystem && loc.numberingSystem !== "latn") {
        return false;
      } else {
        return (
          loc.numberingSystem === "latn" ||
          !loc.locale ||
          loc.locale.startsWith("en") ||
          (hasIntl() && new Intl.DateTimeFormat(loc.intl).resolvedOptions().numberingSystem === "latn")
        );
      }
    }

    /**
     * @private
     */

    class PolyNumberFormatter {
      constructor(intl, forceSimple, opts) {
        this.padTo = opts.padTo || 0;
        this.floor = opts.floor || false;

        if (!forceSimple && hasIntl()) {
          const intlOpts = { useGrouping: false };
          if (opts.padTo > 0) intlOpts.minimumIntegerDigits = opts.padTo;
          this.inf = getCachedINF(intl, intlOpts);
        }
      }

      format(i) {
        if (this.inf) {
          const fixed = this.floor ? Math.floor(i) : i;
          return this.inf.format(fixed);
        } else {
          // to match the browser's numberformatter defaults
          const fixed = this.floor ? Math.floor(i) : roundTo(i, 3);
          return padStart(fixed, this.padTo);
        }
      }
    }

    /**
     * @private
     */

    class PolyDateFormatter {
      constructor(dt, intl, opts) {
        this.opts = opts;
        this.hasIntl = hasIntl();

        let z;
        if (dt.zone.universal && this.hasIntl) {
          // UTC-8 or Etc/UTC-8 are not part of tzdata, only Etc/GMT+8 and the like.
          // That is why fixed-offset TZ is set to that unless it is:
          // 1. Outside of the supported range Etc/GMT-14 to Etc/GMT+12.
          // 2. Not a whole hour, e.g. UTC+4:30.
          const gmtOffset = -1 * (dt.offset / 60);
          if (gmtOffset >= -14 && gmtOffset <= 12 && gmtOffset % 1 === 0) {
            z = gmtOffset >= 0 ? `Etc/GMT+${gmtOffset}` : `Etc/GMT${gmtOffset}`;
            this.dt = dt;
          } else {
            // Not all fixed-offset zones like Etc/+4:30 are present in tzdata.
            // So we have to make do. Two cases:
            // 1. The format options tell us to show the zone. We can't do that, so the best
            // we can do is format the date in UTC.
            // 2. The format options don't tell us to show the zone. Then we can adjust them
            // the time and tell the formatter to show it to us in UTC, so that the time is right
            // and the bad zone doesn't show up.
            z = "UTC";
            if (opts.timeZoneName) {
              this.dt = dt;
            } else {
              this.dt = dt.offset === 0 ? dt : DateTime.fromMillis(dt.ts + dt.offset * 60 * 1000);
            }
          }
        } else if (dt.zone.type === "local") {
          this.dt = dt;
        } else {
          this.dt = dt;
          z = dt.zone.name;
        }

        if (this.hasIntl) {
          const intlOpts = Object.assign({}, this.opts);
          if (z) {
            intlOpts.timeZone = z;
          }
          this.dtf = getCachedDTF(intl, intlOpts);
        }
      }

      format() {
        if (this.hasIntl) {
          return this.dtf.format(this.dt.toJSDate());
        } else {
          const tokenFormat = formatString(this.opts),
            loc = Locale.create("en-US");
          return Formatter.create(loc).formatDateTimeFromString(this.dt, tokenFormat);
        }
      }

      formatToParts() {
        if (this.hasIntl && hasFormatToParts()) {
          return this.dtf.formatToParts(this.dt.toJSDate());
        } else {
          // This is kind of a cop out. We actually could do this for English. However, we couldn't do it for intl strings
          // and IMO it's too weird to have an uncanny valley like that
          return [];
        }
      }

      resolvedOptions() {
        if (this.hasIntl) {
          return this.dtf.resolvedOptions();
        } else {
          return {
            locale: "en-US",
            numberingSystem: "latn",
            outputCalendar: "gregory"
          };
        }
      }
    }

    /**
     * @private
     */
    class PolyRelFormatter {
      constructor(intl, isEnglish, opts) {
        this.opts = Object.assign({ style: "long" }, opts);
        if (!isEnglish && hasRelative()) {
          this.rtf = getCachedRTF(intl, opts);
        }
      }

      format(count, unit) {
        if (this.rtf) {
          return this.rtf.format(count, unit);
        } else {
          return formatRelativeTime(unit, count, this.opts.numeric, this.opts.style !== "long");
        }
      }

      formatToParts(count, unit) {
        if (this.rtf) {
          return this.rtf.formatToParts(count, unit);
        } else {
          return [];
        }
      }
    }

    /**
     * @private
     */

    class Locale {
      static fromOpts(opts) {
        return Locale.create(opts.locale, opts.numberingSystem, opts.outputCalendar, opts.defaultToEN);
      }

      static create(locale, numberingSystem, outputCalendar, defaultToEN = false) {
        const specifiedLocale = locale || Settings.defaultLocale,
          // the system locale is useful for human readable strings but annoying for parsing/formatting known formats
          localeR = specifiedLocale || (defaultToEN ? "en-US" : systemLocale()),
          numberingSystemR = numberingSystem || Settings.defaultNumberingSystem,
          outputCalendarR = outputCalendar || Settings.defaultOutputCalendar;
        return new Locale(localeR, numberingSystemR, outputCalendarR, specifiedLocale);
      }

      static resetCache() {
        sysLocaleCache = null;
        intlDTCache = {};
        intlNumCache = {};
        intlRelCache = {};
      }

      static fromObject({ locale, numberingSystem, outputCalendar } = {}) {
        return Locale.create(locale, numberingSystem, outputCalendar);
      }

      constructor(locale, numbering, outputCalendar, specifiedLocale) {
        const [parsedLocale, parsedNumberingSystem, parsedOutputCalendar] = parseLocaleString(locale);

        this.locale = parsedLocale;
        this.numberingSystem = numbering || parsedNumberingSystem || null;
        this.outputCalendar = outputCalendar || parsedOutputCalendar || null;
        this.intl = intlConfigString(this.locale, this.numberingSystem, this.outputCalendar);

        this.weekdaysCache = { format: {}, standalone: {} };
        this.monthsCache = { format: {}, standalone: {} };
        this.meridiemCache = null;
        this.eraCache = {};

        this.specifiedLocale = specifiedLocale;
        this.fastNumbersCached = null;
      }

      get fastNumbers() {
        if (this.fastNumbersCached == null) {
          this.fastNumbersCached = supportsFastNumbers(this);
        }

        return this.fastNumbersCached;
      }

      listingMode(defaultOK = true) {
        const intl = hasIntl(),
          hasFTP = intl && hasFormatToParts(),
          isActuallyEn = this.isEnglish(),
          hasNoWeirdness =
            (this.numberingSystem === null || this.numberingSystem === "latn") &&
            (this.outputCalendar === null || this.outputCalendar === "gregory");

        if (!hasFTP && !(isActuallyEn && hasNoWeirdness) && !defaultOK) {
          return "error";
        } else if (!hasFTP || (isActuallyEn && hasNoWeirdness)) {
          return "en";
        } else {
          return "intl";
        }
      }

      clone(alts) {
        if (!alts || Object.getOwnPropertyNames(alts).length === 0) {
          return this;
        } else {
          return Locale.create(
            alts.locale || this.specifiedLocale,
            alts.numberingSystem || this.numberingSystem,
            alts.outputCalendar || this.outputCalendar,
            alts.defaultToEN || false
          );
        }
      }

      redefaultToEN(alts = {}) {
        return this.clone(Object.assign({}, alts, { defaultToEN: true }));
      }

      redefaultToSystem(alts = {}) {
        return this.clone(Object.assign({}, alts, { defaultToEN: false }));
      }

      months(length, format = false, defaultOK = true) {
        return listStuff(this, length, defaultOK, months, () => {
          const intl = format ? { month: length, day: "numeric" } : { month: length },
            formatStr = format ? "format" : "standalone";
          if (!this.monthsCache[formatStr][length]) {
            this.monthsCache[formatStr][length] = mapMonths(dt => this.extract(dt, intl, "month"));
          }
          return this.monthsCache[formatStr][length];
        });
      }

      weekdays(length, format = false, defaultOK = true) {
        return listStuff(this, length, defaultOK, weekdays, () => {
          const intl = format
              ? { weekday: length, year: "numeric", month: "long", day: "numeric" }
              : { weekday: length },
            formatStr = format ? "format" : "standalone";
          if (!this.weekdaysCache[formatStr][length]) {
            this.weekdaysCache[formatStr][length] = mapWeekdays(dt =>
              this.extract(dt, intl, "weekday")
            );
          }
          return this.weekdaysCache[formatStr][length];
        });
      }

      meridiems(defaultOK = true) {
        return listStuff(
          this,
          undefined,
          defaultOK,
          () => meridiems,
          () => {
            // In theory there could be aribitrary day periods. We're gonna assume there are exactly two
            // for AM and PM. This is probably wrong, but it's makes parsing way easier.
            if (!this.meridiemCache) {
              const intl = { hour: "numeric", hour12: true };
              this.meridiemCache = [DateTime.utc(2016, 11, 13, 9), DateTime.utc(2016, 11, 13, 19)].map(
                dt => this.extract(dt, intl, "dayperiod")
              );
            }

            return this.meridiemCache;
          }
        );
      }

      eras(length, defaultOK = true) {
        return listStuff(this, length, defaultOK, eras, () => {
          const intl = { era: length };

          // This is problematic. Different calendars are going to define eras totally differently. What I need is the minimum set of dates
          // to definitely enumerate them.
          if (!this.eraCache[length]) {
            this.eraCache[length] = [DateTime.utc(-40, 1, 1), DateTime.utc(2017, 1, 1)].map(dt =>
              this.extract(dt, intl, "era")
            );
          }

          return this.eraCache[length];
        });
      }

      extract(dt, intlOpts, field) {
        const df = this.dtFormatter(dt, intlOpts),
          results = df.formatToParts(),
          matching = results.find(m => m.type.toLowerCase() === field);
        return matching ? matching.value : null;
      }

      numberFormatter(opts = {}) {
        // this forcesimple option is never used (the only caller short-circuits on it, but it seems safer to leave)
        // (in contrast, the rest of the condition is used heavily)
        return new PolyNumberFormatter(this.intl, opts.forceSimple || this.fastNumbers, opts);
      }

      dtFormatter(dt, intlOpts = {}) {
        return new PolyDateFormatter(dt, this.intl, intlOpts);
      }

      relFormatter(opts = {}) {
        return new PolyRelFormatter(this.intl, this.isEnglish(), opts);
      }

      isEnglish() {
        return (
          this.locale === "en" ||
          this.locale.toLowerCase() === "en-us" ||
          (hasIntl() && new Intl.DateTimeFormat(this.intl).resolvedOptions().locale.startsWith("en-us"))
        );
      }

      equals(other) {
        return (
          this.locale === other.locale &&
          this.numberingSystem === other.numberingSystem &&
          this.outputCalendar === other.outputCalendar
        );
      }
    }

    /*
     * This file handles parsing for well-specified formats. Here's how it works:
     * Two things go into parsing: a regex to match with and an extractor to take apart the groups in the match.
     * An extractor is just a function that takes a regex match array and returns a { year: ..., month: ... } object
     * parse() does the work of executing the regex and applying the extractor. It takes multiple regex/extractor pairs to try in sequence.
     * Extractors can take a "cursor" representing the offset in the match to look at. This makes it easy to combine extractors.
     * combineExtractors() does the work of combining them, keeping track of the cursor through multiple extractions.
     * Some extractions are super dumb and simpleParse and fromStrings help DRY them.
     */

    function combineRegexes(...regexes) {
      const full = regexes.reduce((f, r) => f + r.source, "");
      return RegExp(`^${full}$`);
    }

    function combineExtractors(...extractors) {
      return m =>
        extractors
          .reduce(
            ([mergedVals, mergedZone, cursor], ex) => {
              const [val, zone, next] = ex(m, cursor);
              return [Object.assign(mergedVals, val), mergedZone || zone, next];
            },
            [{}, null, 1]
          )
          .slice(0, 2);
    }

    function parse(s, ...patterns) {
      if (s == null) {
        return [null, null];
      }

      for (const [regex, extractor] of patterns) {
        const m = regex.exec(s);
        if (m) {
          return extractor(m);
        }
      }
      return [null, null];
    }

    function simpleParse(...keys) {
      return (match, cursor) => {
        const ret = {};
        let i;

        for (i = 0; i < keys.length; i++) {
          ret[keys[i]] = parseInteger(match[cursor + i]);
        }
        return [ret, null, cursor + i];
      };
    }

    // ISO and SQL parsing
    const offsetRegex = /(?:(Z)|([+-]\d\d)(?::?(\d\d))?)/,
      isoTimeBaseRegex = /(\d\d)(?::?(\d\d)(?::?(\d\d)(?:[.,](\d{1,30}))?)?)?/,
      isoTimeRegex = RegExp(`${isoTimeBaseRegex.source}${offsetRegex.source}?`),
      isoTimeExtensionRegex = RegExp(`(?:T${isoTimeRegex.source})?`),
      isoYmdRegex = /([+-]\d{6}|\d{4})(?:-?(\d\d)(?:-?(\d\d))?)?/,
      isoWeekRegex = /(\d{4})-?W(\d\d)(?:-?(\d))?/,
      isoOrdinalRegex = /(\d{4})-?(\d{3})/,
      extractISOWeekData = simpleParse("weekYear", "weekNumber", "weekDay"),
      extractISOOrdinalData = simpleParse("year", "ordinal"),
      sqlYmdRegex = /(\d{4})-(\d\d)-(\d\d)/, // dumbed-down version of the ISO one
      sqlTimeRegex = RegExp(
        `${isoTimeBaseRegex.source} ?(?:${offsetRegex.source}|(${ianaRegex.source}))?`
      ),
      sqlTimeExtensionRegex = RegExp(`(?: ${sqlTimeRegex.source})?`);

    function int(match, pos, fallback) {
      const m = match[pos];
      return isUndefined(m) ? fallback : parseInteger(m);
    }

    function extractISOYmd(match, cursor) {
      const item = {
        year: int(match, cursor),
        month: int(match, cursor + 1, 1),
        day: int(match, cursor + 2, 1)
      };

      return [item, null, cursor + 3];
    }

    function extractISOTime(match, cursor) {
      const item = {
        hours: int(match, cursor, 0),
        minutes: int(match, cursor + 1, 0),
        seconds: int(match, cursor + 2, 0),
        milliseconds: parseMillis(match[cursor + 3])
      };

      return [item, null, cursor + 4];
    }

    function extractISOOffset(match, cursor) {
      const local = !match[cursor] && !match[cursor + 1],
        fullOffset = signedOffset(match[cursor + 1], match[cursor + 2]),
        zone = local ? null : FixedOffsetZone.instance(fullOffset);
      return [{}, zone, cursor + 3];
    }

    function extractIANAZone(match, cursor) {
      const zone = match[cursor] ? IANAZone.create(match[cursor]) : null;
      return [{}, zone, cursor + 1];
    }

    // ISO time parsing

    const isoTimeOnly = RegExp(`^T?${isoTimeBaseRegex.source}$`);

    // ISO duration parsing

    const isoDuration = /^-?P(?:(?:(-?\d{1,9})Y)?(?:(-?\d{1,9})M)?(?:(-?\d{1,9})W)?(?:(-?\d{1,9})D)?(?:T(?:(-?\d{1,9})H)?(?:(-?\d{1,9})M)?(?:(-?\d{1,20})(?:[.,](-?\d{1,9}))?S)?)?)$/;

    function extractISODuration(match) {
      const [
        s,
        yearStr,
        monthStr,
        weekStr,
        dayStr,
        hourStr,
        minuteStr,
        secondStr,
        millisecondsStr
      ] = match;

      const hasNegativePrefix = s[0] === "-";

      const maybeNegate = num => (num && hasNegativePrefix ? -num : num);

      return [
        {
          years: maybeNegate(parseInteger(yearStr)),
          months: maybeNegate(parseInteger(monthStr)),
          weeks: maybeNegate(parseInteger(weekStr)),
          days: maybeNegate(parseInteger(dayStr)),
          hours: maybeNegate(parseInteger(hourStr)),
          minutes: maybeNegate(parseInteger(minuteStr)),
          seconds: maybeNegate(parseInteger(secondStr)),
          milliseconds: maybeNegate(parseMillis(millisecondsStr))
        }
      ];
    }

    // These are a little braindead. EDT *should* tell us that we're in, say, America/New_York
    // and not just that we're in -240 *right now*. But since I don't think these are used that often
    // I'm just going to ignore that
    const obsOffsets = {
      GMT: 0,
      EDT: -4 * 60,
      EST: -5 * 60,
      CDT: -5 * 60,
      CST: -6 * 60,
      MDT: -6 * 60,
      MST: -7 * 60,
      PDT: -7 * 60,
      PST: -8 * 60
    };

    function fromStrings(weekdayStr, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr) {
      const result = {
        year: yearStr.length === 2 ? untruncateYear(parseInteger(yearStr)) : parseInteger(yearStr),
        month: monthsShort.indexOf(monthStr) + 1,
        day: parseInteger(dayStr),
        hour: parseInteger(hourStr),
        minute: parseInteger(minuteStr)
      };

      if (secondStr) result.second = parseInteger(secondStr);
      if (weekdayStr) {
        result.weekday =
          weekdayStr.length > 3
            ? weekdaysLong.indexOf(weekdayStr) + 1
            : weekdaysShort.indexOf(weekdayStr) + 1;
      }

      return result;
    }

    // RFC 2822/5322
    const rfc2822 = /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s)?(\d{1,2})\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s(\d{2,4})\s(\d\d):(\d\d)(?::(\d\d))?\s(?:(UT|GMT|[ECMP][SD]T)|([Zz])|(?:([+-]\d\d)(\d\d)))$/;

    function extractRFC2822(match) {
      const [
          ,
          weekdayStr,
          dayStr,
          monthStr,
          yearStr,
          hourStr,
          minuteStr,
          secondStr,
          obsOffset,
          milOffset,
          offHourStr,
          offMinuteStr
        ] = match,
        result = fromStrings(weekdayStr, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr);

      let offset;
      if (obsOffset) {
        offset = obsOffsets[obsOffset];
      } else if (milOffset) {
        offset = 0;
      } else {
        offset = signedOffset(offHourStr, offMinuteStr);
      }

      return [result, new FixedOffsetZone(offset)];
    }

    function preprocessRFC2822(s) {
      // Remove comments and folding whitespace and replace multiple-spaces with a single space
      return s
        .replace(/\([^)]*\)|[\n\t]/g, " ")
        .replace(/(\s\s+)/g, " ")
        .trim();
    }

    // http date

    const rfc1123 = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d\d) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d\d):(\d\d):(\d\d) GMT$/,
      rfc850 = /^(Monday|Tuesday|Wedsday|Thursday|Friday|Saturday|Sunday), (\d\d)-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d\d) (\d\d):(\d\d):(\d\d) GMT$/,
      ascii = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ( \d|\d\d) (\d\d):(\d\d):(\d\d) (\d{4})$/;

    function extractRFC1123Or850(match) {
      const [, weekdayStr, dayStr, monthStr, yearStr, hourStr, minuteStr, secondStr] = match,
        result = fromStrings(weekdayStr, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr);
      return [result, FixedOffsetZone.utcInstance];
    }

    function extractASCII(match) {
      const [, weekdayStr, monthStr, dayStr, hourStr, minuteStr, secondStr, yearStr] = match,
        result = fromStrings(weekdayStr, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr);
      return [result, FixedOffsetZone.utcInstance];
    }

    const isoYmdWithTimeExtensionRegex = combineRegexes(isoYmdRegex, isoTimeExtensionRegex);
    const isoWeekWithTimeExtensionRegex = combineRegexes(isoWeekRegex, isoTimeExtensionRegex);
    const isoOrdinalWithTimeExtensionRegex = combineRegexes(isoOrdinalRegex, isoTimeExtensionRegex);
    const isoTimeCombinedRegex = combineRegexes(isoTimeRegex);

    const extractISOYmdTimeAndOffset = combineExtractors(
      extractISOYmd,
      extractISOTime,
      extractISOOffset
    );
    const extractISOWeekTimeAndOffset = combineExtractors(
      extractISOWeekData,
      extractISOTime,
      extractISOOffset
    );
    const extractISOOrdinalDataAndTime = combineExtractors(extractISOOrdinalData, extractISOTime);
    const extractISOTimeAndOffset = combineExtractors(extractISOTime, extractISOOffset);

    /**
     * @private
     */

    function parseISODate(s) {
      return parse(
        s,
        [isoYmdWithTimeExtensionRegex, extractISOYmdTimeAndOffset],
        [isoWeekWithTimeExtensionRegex, extractISOWeekTimeAndOffset],
        [isoOrdinalWithTimeExtensionRegex, extractISOOrdinalDataAndTime],
        [isoTimeCombinedRegex, extractISOTimeAndOffset]
      );
    }

    function parseRFC2822Date(s) {
      return parse(preprocessRFC2822(s), [rfc2822, extractRFC2822]);
    }

    function parseHTTPDate(s) {
      return parse(
        s,
        [rfc1123, extractRFC1123Or850],
        [rfc850, extractRFC1123Or850],
        [ascii, extractASCII]
      );
    }

    function parseISODuration(s) {
      return parse(s, [isoDuration, extractISODuration]);
    }

    const extractISOTimeOnly = combineExtractors(extractISOTime);

    function parseISOTimeOnly(s) {
      return parse(s, [isoTimeOnly, extractISOTimeOnly]);
    }

    const sqlYmdWithTimeExtensionRegex = combineRegexes(sqlYmdRegex, sqlTimeExtensionRegex);
    const sqlTimeCombinedRegex = combineRegexes(sqlTimeRegex);

    const extractISOYmdTimeOffsetAndIANAZone = combineExtractors(
      extractISOYmd,
      extractISOTime,
      extractISOOffset,
      extractIANAZone
    );
    const extractISOTimeOffsetAndIANAZone = combineExtractors(
      extractISOTime,
      extractISOOffset,
      extractIANAZone
    );

    function parseSQL(s) {
      return parse(
        s,
        [sqlYmdWithTimeExtensionRegex, extractISOYmdTimeOffsetAndIANAZone],
        [sqlTimeCombinedRegex, extractISOTimeOffsetAndIANAZone]
      );
    }

    const INVALID = "Invalid Duration";

    // unit conversion constants
    const lowOrderMatrix = {
        weeks: {
          days: 7,
          hours: 7 * 24,
          minutes: 7 * 24 * 60,
          seconds: 7 * 24 * 60 * 60,
          milliseconds: 7 * 24 * 60 * 60 * 1000
        },
        days: {
          hours: 24,
          minutes: 24 * 60,
          seconds: 24 * 60 * 60,
          milliseconds: 24 * 60 * 60 * 1000
        },
        hours: { minutes: 60, seconds: 60 * 60, milliseconds: 60 * 60 * 1000 },
        minutes: { seconds: 60, milliseconds: 60 * 1000 },
        seconds: { milliseconds: 1000 }
      },
      casualMatrix = Object.assign(
        {
          years: {
            quarters: 4,
            months: 12,
            weeks: 52,
            days: 365,
            hours: 365 * 24,
            minutes: 365 * 24 * 60,
            seconds: 365 * 24 * 60 * 60,
            milliseconds: 365 * 24 * 60 * 60 * 1000
          },
          quarters: {
            months: 3,
            weeks: 13,
            days: 91,
            hours: 91 * 24,
            minutes: 91 * 24 * 60,
            seconds: 91 * 24 * 60 * 60,
            milliseconds: 91 * 24 * 60 * 60 * 1000
          },
          months: {
            weeks: 4,
            days: 30,
            hours: 30 * 24,
            minutes: 30 * 24 * 60,
            seconds: 30 * 24 * 60 * 60,
            milliseconds: 30 * 24 * 60 * 60 * 1000
          }
        },
        lowOrderMatrix
      ),
      daysInYearAccurate = 146097.0 / 400,
      daysInMonthAccurate = 146097.0 / 4800,
      accurateMatrix = Object.assign(
        {
          years: {
            quarters: 4,
            months: 12,
            weeks: daysInYearAccurate / 7,
            days: daysInYearAccurate,
            hours: daysInYearAccurate * 24,
            minutes: daysInYearAccurate * 24 * 60,
            seconds: daysInYearAccurate * 24 * 60 * 60,
            milliseconds: daysInYearAccurate * 24 * 60 * 60 * 1000
          },
          quarters: {
            months: 3,
            weeks: daysInYearAccurate / 28,
            days: daysInYearAccurate / 4,
            hours: (daysInYearAccurate * 24) / 4,
            minutes: (daysInYearAccurate * 24 * 60) / 4,
            seconds: (daysInYearAccurate * 24 * 60 * 60) / 4,
            milliseconds: (daysInYearAccurate * 24 * 60 * 60 * 1000) / 4
          },
          months: {
            weeks: daysInMonthAccurate / 7,
            days: daysInMonthAccurate,
            hours: daysInMonthAccurate * 24,
            minutes: daysInMonthAccurate * 24 * 60,
            seconds: daysInMonthAccurate * 24 * 60 * 60,
            milliseconds: daysInMonthAccurate * 24 * 60 * 60 * 1000
          }
        },
        lowOrderMatrix
      );

    // units ordered by size
    const orderedUnits = [
      "years",
      "quarters",
      "months",
      "weeks",
      "days",
      "hours",
      "minutes",
      "seconds",
      "milliseconds"
    ];

    const reverseUnits = orderedUnits.slice(0).reverse();

    // clone really means "create another instance just like this one, but with these changes"
    function clone(dur, alts, clear = false) {
      // deep merge for vals
      const conf = {
        values: clear ? alts.values : Object.assign({}, dur.values, alts.values || {}),
        loc: dur.loc.clone(alts.loc),
        conversionAccuracy: alts.conversionAccuracy || dur.conversionAccuracy
      };
      return new Duration(conf);
    }

    function antiTrunc(n) {
      return n < 0 ? Math.floor(n) : Math.ceil(n);
    }

    // NB: mutates parameters
    function convert(matrix, fromMap, fromUnit, toMap, toUnit) {
      const conv = matrix[toUnit][fromUnit],
        raw = fromMap[fromUnit] / conv,
        sameSign = Math.sign(raw) === Math.sign(toMap[toUnit]),
        // ok, so this is wild, but see the matrix in the tests
        added =
          !sameSign && toMap[toUnit] !== 0 && Math.abs(raw) <= 1 ? antiTrunc(raw) : Math.trunc(raw);
      toMap[toUnit] += added;
      fromMap[fromUnit] -= added * conv;
    }

    // NB: mutates parameters
    function normalizeValues(matrix, vals) {
      reverseUnits.reduce((previous, current) => {
        if (!isUndefined(vals[current])) {
          if (previous) {
            convert(matrix, vals, previous, vals, current);
          }
          return current;
        } else {
          return previous;
        }
      }, null);
    }

    /**
     * A Duration object represents a period of time, like "2 months" or "1 day, 1 hour". Conceptually, it's just a map of units to their quantities, accompanied by some additional configuration and methods for creating, parsing, interrogating, transforming, and formatting them. They can be used on their own or in conjunction with other Luxon types; for example, you can use {@link DateTime.plus} to add a Duration object to a DateTime, producing another DateTime.
     *
     * Here is a brief overview of commonly used methods and getters in Duration:
     *
     * * **Creation** To create a Duration, use {@link Duration.fromMillis}, {@link Duration.fromObject}, or {@link Duration.fromISO}.
     * * **Unit values** See the {@link Duration.years}, {@link Duration.months}, {@link Duration.weeks}, {@link Duration.days}, {@link Duration.hours}, {@link Duration.minutes}, {@link Duration.seconds}, {@link Duration.milliseconds} accessors.
     * * **Configuration** See  {@link Duration.locale} and {@link Duration.numberingSystem} accessors.
     * * **Transformation** To create new Durations out of old ones use {@link Duration.plus}, {@link Duration.minus}, {@link Duration.normalize}, {@link Duration.set}, {@link Duration.reconfigure}, {@link Duration.shiftTo}, and {@link Duration.negate}.
     * * **Output** To convert the Duration into other representations, see {@link Duration.as}, {@link Duration.toISO}, {@link Duration.toFormat}, and {@link Duration.toJSON}
     *
     * There's are more methods documented below. In addition, for more information on subtler topics like internationalization and validity, see the external documentation.
     */
    class Duration {
      /**
       * @private
       */
      constructor(config) {
        const accurate = config.conversionAccuracy === "longterm" || false;
        /**
         * @access private
         */
        this.values = config.values;
        /**
         * @access private
         */
        this.loc = config.loc || Locale.create();
        /**
         * @access private
         */
        this.conversionAccuracy = accurate ? "longterm" : "casual";
        /**
         * @access private
         */
        this.invalid = config.invalid || null;
        /**
         * @access private
         */
        this.matrix = accurate ? accurateMatrix : casualMatrix;
        /**
         * @access private
         */
        this.isLuxonDuration = true;
      }

      /**
       * Create Duration from a number of milliseconds.
       * @param {number} count of milliseconds
       * @param {Object} opts - options for parsing
       * @param {string} [opts.locale='en-US'] - the locale to use
       * @param {string} opts.numberingSystem - the numbering system to use
       * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
       * @return {Duration}
       */
      static fromMillis(count, opts) {
        return Duration.fromObject(Object.assign({ milliseconds: count }, opts));
      }

      /**
       * Create a Duration from a JavaScript object with keys like 'years' and 'hours.
       * If this object is empty then a zero milliseconds duration is returned.
       * @param {Object} obj - the object to create the DateTime from
       * @param {number} obj.years
       * @param {number} obj.quarters
       * @param {number} obj.months
       * @param {number} obj.weeks
       * @param {number} obj.days
       * @param {number} obj.hours
       * @param {number} obj.minutes
       * @param {number} obj.seconds
       * @param {number} obj.milliseconds
       * @param {string} [obj.locale='en-US'] - the locale to use
       * @param {string} obj.numberingSystem - the numbering system to use
       * @param {string} [obj.conversionAccuracy='casual'] - the conversion system to use
       * @return {Duration}
       */
      static fromObject(obj) {
        if (obj == null || typeof obj !== "object") {
          throw new InvalidArgumentError(
            `Duration.fromObject: argument expected to be an object, got ${
          obj === null ? "null" : typeof obj
        }`
          );
        }
        return new Duration({
          values: normalizeObject(obj, Duration.normalizeUnit, [
            "locale",
            "numberingSystem",
            "conversionAccuracy",
            "zone" // a bit of debt; it's super inconvenient internally not to be able to blindly pass this
          ]),
          loc: Locale.fromObject(obj),
          conversionAccuracy: obj.conversionAccuracy
        });
      }

      /**
       * Create a Duration from an ISO 8601 duration string.
       * @param {string} text - text to parse
       * @param {Object} opts - options for parsing
       * @param {string} [opts.locale='en-US'] - the locale to use
       * @param {string} opts.numberingSystem - the numbering system to use
       * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
       * @see https://en.wikipedia.org/wiki/ISO_8601#Durations
       * @example Duration.fromISO('P3Y6M1W4DT12H30M5S').toObject() //=> { years: 3, months: 6, weeks: 1, days: 4, hours: 12, minutes: 30, seconds: 5 }
       * @example Duration.fromISO('PT23H').toObject() //=> { hours: 23 }
       * @example Duration.fromISO('P5Y3M').toObject() //=> { years: 5, months: 3 }
       * @return {Duration}
       */
      static fromISO(text, opts) {
        const [parsed] = parseISODuration(text);
        if (parsed) {
          const obj = Object.assign(parsed, opts);
          return Duration.fromObject(obj);
        } else {
          return Duration.invalid("unparsable", `the input "${text}" can't be parsed as ISO 8601`);
        }
      }

      /**
       * Create a Duration from an ISO 8601 time string.
       * @param {string} text - text to parse
       * @param {Object} opts - options for parsing
       * @param {string} [opts.locale='en-US'] - the locale to use
       * @param {string} opts.numberingSystem - the numbering system to use
       * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
       * @see https://en.wikipedia.org/wiki/ISO_8601#Times
       * @example Duration.fromISOTime('11:22:33.444').toObject() //=> { hours: 11, minutes: 22, seconds: 33, milliseconds: 444 }
       * @example Duration.fromISOTime('11:00').toObject() //=> { hours: 11, minutes: 0, seconds: 0 }
       * @example Duration.fromISOTime('T11:00').toObject() //=> { hours: 11, minutes: 0, seconds: 0 }
       * @example Duration.fromISOTime('1100').toObject() //=> { hours: 11, minutes: 0, seconds: 0 }
       * @example Duration.fromISOTime('T1100').toObject() //=> { hours: 11, minutes: 0, seconds: 0 }
       * @return {Duration}
       */
      static fromISOTime(text, opts) {
        const [parsed] = parseISOTimeOnly(text);
        if (parsed) {
          const obj = Object.assign(parsed, opts);
          return Duration.fromObject(obj);
        } else {
          return Duration.invalid("unparsable", `the input "${text}" can't be parsed as ISO 8601`);
        }
      }

      /**
       * Create an invalid Duration.
       * @param {string} reason - simple string of why this datetime is invalid. Should not contain parameters or anything else data-dependent
       * @param {string} [explanation=null] - longer explanation, may include parameters and other useful debugging information
       * @return {Duration}
       */
      static invalid(reason, explanation = null) {
        if (!reason) {
          throw new InvalidArgumentError("need to specify a reason the Duration is invalid");
        }

        const invalid = reason instanceof Invalid ? reason : new Invalid(reason, explanation);

        if (Settings.throwOnInvalid) {
          throw new InvalidDurationError(invalid);
        } else {
          return new Duration({ invalid });
        }
      }

      /**
       * @private
       */
      static normalizeUnit(unit) {
        const normalized = {
          year: "years",
          years: "years",
          quarter: "quarters",
          quarters: "quarters",
          month: "months",
          months: "months",
          week: "weeks",
          weeks: "weeks",
          day: "days",
          days: "days",
          hour: "hours",
          hours: "hours",
          minute: "minutes",
          minutes: "minutes",
          second: "seconds",
          seconds: "seconds",
          millisecond: "milliseconds",
          milliseconds: "milliseconds"
        }[unit ? unit.toLowerCase() : unit];

        if (!normalized) throw new InvalidUnitError(unit);

        return normalized;
      }

      /**
       * Check if an object is a Duration. Works across context boundaries
       * @param {object} o
       * @return {boolean}
       */
      static isDuration(o) {
        return (o && o.isLuxonDuration) || false;
      }

      /**
       * Get  the locale of a Duration, such 'en-GB'
       * @type {string}
       */
      get locale() {
        return this.isValid ? this.loc.locale : null;
      }

      /**
       * Get the numbering system of a Duration, such 'beng'. The numbering system is used when formatting the Duration
       *
       * @type {string}
       */
      get numberingSystem() {
        return this.isValid ? this.loc.numberingSystem : null;
      }

      /**
       * Returns a string representation of this Duration formatted according to the specified format string. You may use these tokens:
       * * `S` for milliseconds
       * * `s` for seconds
       * * `m` for minutes
       * * `h` for hours
       * * `d` for days
       * * `M` for months
       * * `y` for years
       * Notes:
       * * Add padding by repeating the token, e.g. "yy" pads the years to two digits, "hhhh" pads the hours out to four digits
       * * The duration will be converted to the set of units in the format string using {@link Duration.shiftTo} and the Durations's conversion accuracy setting.
       * @param {string} fmt - the format string
       * @param {Object} opts - options
       * @param {boolean} [opts.floor=true] - floor numerical values
       * @example Duration.fromObject({ years: 1, days: 6, seconds: 2 }).toFormat("y d s") //=> "1 6 2"
       * @example Duration.fromObject({ years: 1, days: 6, seconds: 2 }).toFormat("yy dd sss") //=> "01 06 002"
       * @example Duration.fromObject({ years: 1, days: 6, seconds: 2 }).toFormat("M S") //=> "12 518402000"
       * @return {string}
       */
      toFormat(fmt, opts = {}) {
        // reverse-compat since 1.2; we always round down now, never up, and we do it by default
        const fmtOpts = Object.assign({}, opts, {
          floor: opts.round !== false && opts.floor !== false
        });
        return this.isValid
          ? Formatter.create(this.loc, fmtOpts).formatDurationFromString(this, fmt)
          : INVALID;
      }

      /**
       * Returns a JavaScript object with this Duration's values.
       * @param opts - options for generating the object
       * @param {boolean} [opts.includeConfig=false] - include configuration attributes in the output
       * @example Duration.fromObject({ years: 1, days: 6, seconds: 2 }).toObject() //=> { years: 1, days: 6, seconds: 2 }
       * @return {Object}
       */
      toObject(opts = {}) {
        if (!this.isValid) return {};

        const base = Object.assign({}, this.values);

        if (opts.includeConfig) {
          base.conversionAccuracy = this.conversionAccuracy;
          base.numberingSystem = this.loc.numberingSystem;
          base.locale = this.loc.locale;
        }
        return base;
      }

      /**
       * Returns an ISO 8601-compliant string representation of this Duration.
       * @see https://en.wikipedia.org/wiki/ISO_8601#Durations
       * @example Duration.fromObject({ years: 3, seconds: 45 }).toISO() //=> 'P3YT45S'
       * @example Duration.fromObject({ months: 4, seconds: 45 }).toISO() //=> 'P4MT45S'
       * @example Duration.fromObject({ months: 5 }).toISO() //=> 'P5M'
       * @example Duration.fromObject({ minutes: 5 }).toISO() //=> 'PT5M'
       * @example Duration.fromObject({ milliseconds: 6 }).toISO() //=> 'PT0.006S'
       * @return {string}
       */
      toISO() {
        // we could use the formatter, but this is an easier way to get the minimum string
        if (!this.isValid) return null;

        let s = "P";
        if (this.years !== 0) s += this.years + "Y";
        if (this.months !== 0 || this.quarters !== 0) s += this.months + this.quarters * 3 + "M";
        if (this.weeks !== 0) s += this.weeks + "W";
        if (this.days !== 0) s += this.days + "D";
        if (this.hours !== 0 || this.minutes !== 0 || this.seconds !== 0 || this.milliseconds !== 0)
          s += "T";
        if (this.hours !== 0) s += this.hours + "H";
        if (this.minutes !== 0) s += this.minutes + "M";
        if (this.seconds !== 0 || this.milliseconds !== 0)
          // this will handle "floating point madness" by removing extra decimal places
          // https://stackoverflow.com/questions/588004/is-floating-point-math-broken
          s += roundTo(this.seconds + this.milliseconds / 1000, 3) + "S";
        if (s === "P") s += "T0S";
        return s;
      }

      /**
       * Returns an ISO 8601-compliant string representation of this Duration, formatted as a time of day.
       * Note that this will return null if the duration is invalid, negative, or equal to or greater than 24 hours.
       * @see https://en.wikipedia.org/wiki/ISO_8601#Times
       * @param {Object} opts - options
       * @param {boolean} [opts.suppressMilliseconds=false] - exclude milliseconds from the format if they're 0
       * @param {boolean} [opts.suppressSeconds=false] - exclude seconds from the format if they're 0
       * @param {boolean} [opts.includePrefix=false] - include the `T` prefix
       * @param {string} [opts.format='extended'] - choose between the basic and extended format
       * @example Duration.fromObject({ hours: 11 }).toISOTime() //=> '11:00:00.000'
       * @example Duration.fromObject({ hours: 11 }).toISOTime({ suppressMilliseconds: true }) //=> '11:00:00'
       * @example Duration.fromObject({ hours: 11 }).toISOTime({ suppressSeconds: true }) //=> '11:00'
       * @example Duration.fromObject({ hours: 11 }).toISOTime({ includePrefix: true }) //=> 'T11:00:00.000'
       * @example Duration.fromObject({ hours: 11 }).toISOTime({ format: 'basic' }) //=> '110000.000'
       * @return {string}
       */
      toISOTime(opts = {}) {
        if (!this.isValid) return null;

        const millis = this.toMillis();
        if (millis < 0 || millis >= 86400000) return null;

        opts = Object.assign(
          {
            suppressMilliseconds: false,
            suppressSeconds: false,
            includePrefix: false,
            format: "extended"
          },
          opts
        );

        const value = this.shiftTo("hours", "minutes", "seconds", "milliseconds");

        let fmt = opts.format === "basic" ? "hhmm" : "hh:mm";

        if (!opts.suppressSeconds || value.seconds !== 0 || value.milliseconds !== 0) {
          fmt += opts.format === "basic" ? "ss" : ":ss";
          if (!opts.suppressMilliseconds || value.milliseconds !== 0) {
            fmt += ".SSS";
          }
        }

        let str = value.toFormat(fmt);

        if (opts.includePrefix) {
          str = "T" + str;
        }

        return str;
      }

      /**
       * Returns an ISO 8601 representation of this Duration appropriate for use in JSON.
       * @return {string}
       */
      toJSON() {
        return this.toISO();
      }

      /**
       * Returns an ISO 8601 representation of this Duration appropriate for use in debugging.
       * @return {string}
       */
      toString() {
        return this.toISO();
      }

      /**
       * Returns an milliseconds value of this Duration.
       * @return {number}
       */
      toMillis() {
        return this.as("milliseconds");
      }

      /**
       * Returns an milliseconds value of this Duration. Alias of {@link toMillis}
       * @return {number}
       */
      valueOf() {
        return this.toMillis();
      }

      /**
       * Make this Duration longer by the specified amount. Return a newly-constructed Duration.
       * @param {Duration|Object|number} duration - The amount to add. Either a Luxon Duration, a number of milliseconds, the object argument to Duration.fromObject()
       * @return {Duration}
       */
      plus(duration) {
        if (!this.isValid) return this;

        const dur = friendlyDuration(duration),
          result = {};

        for (const k of orderedUnits) {
          if (hasOwnProperty(dur.values, k) || hasOwnProperty(this.values, k)) {
            result[k] = dur.get(k) + this.get(k);
          }
        }

        return clone(this, { values: result }, true);
      }

      /**
       * Make this Duration shorter by the specified amount. Return a newly-constructed Duration.
       * @param {Duration|Object|number} duration - The amount to subtract. Either a Luxon Duration, a number of milliseconds, the object argument to Duration.fromObject()
       * @return {Duration}
       */
      minus(duration) {
        if (!this.isValid) return this;

        const dur = friendlyDuration(duration);
        return this.plus(dur.negate());
      }

      /**
       * Scale this Duration by the specified amount. Return a newly-constructed Duration.
       * @param {function} fn - The function to apply to each unit. Arity is 1 or 2: the value of the unit and, optionally, the unit name. Must return a number.
       * @example Duration.fromObject({ hours: 1, minutes: 30 }).mapUnit(x => x * 2) //=> { hours: 2, minutes: 60 }
       * @example Duration.fromObject({ hours: 1, minutes: 30 }).mapUnit((x, u) => u === "hour" ? x * 2 : x) //=> { hours: 2, minutes: 30 }
       * @return {Duration}
       */
      mapUnits(fn) {
        if (!this.isValid) return this;
        const result = {};
        for (const k of Object.keys(this.values)) {
          result[k] = asNumber(fn(this.values[k], k));
        }
        return clone(this, { values: result }, true);
      }

      /**
       * Get the value of unit.
       * @param {string} unit - a unit such as 'minute' or 'day'
       * @example Duration.fromObject({years: 2, days: 3}).years //=> 2
       * @example Duration.fromObject({years: 2, days: 3}).months //=> 0
       * @example Duration.fromObject({years: 2, days: 3}).days //=> 3
       * @return {number}
       */
      get(unit) {
        return this[Duration.normalizeUnit(unit)];
      }

      /**
       * "Set" the values of specified units. Return a newly-constructed Duration.
       * @param {Object} values - a mapping of units to numbers
       * @example dur.set({ years: 2017 })
       * @example dur.set({ hours: 8, minutes: 30 })
       * @return {Duration}
       */
      set(values) {
        if (!this.isValid) return this;

        const mixed = Object.assign(this.values, normalizeObject(values, Duration.normalizeUnit, []));
        return clone(this, { values: mixed });
      }

      /**
       * "Set" the locale and/or numberingSystem.  Returns a newly-constructed Duration.
       * @example dur.reconfigure({ locale: 'en-GB' })
       * @return {Duration}
       */
      reconfigure({ locale, numberingSystem, conversionAccuracy } = {}) {
        const loc = this.loc.clone({ locale, numberingSystem }),
          opts = { loc };

        if (conversionAccuracy) {
          opts.conversionAccuracy = conversionAccuracy;
        }

        return clone(this, opts);
      }

      /**
       * Return the length of the duration in the specified unit.
       * @param {string} unit - a unit such as 'minutes' or 'days'
       * @example Duration.fromObject({years: 1}).as('days') //=> 365
       * @example Duration.fromObject({years: 1}).as('months') //=> 12
       * @example Duration.fromObject({hours: 60}).as('days') //=> 2.5
       * @return {number}
       */
      as(unit) {
        return this.isValid ? this.shiftTo(unit).get(unit) : NaN;
      }

      /**
       * Reduce this Duration to its canonical representation in its current units.
       * @example Duration.fromObject({ years: 2, days: 5000 }).normalize().toObject() //=> { years: 15, days: 255 }
       * @example Duration.fromObject({ hours: 12, minutes: -45 }).normalize().toObject() //=> { hours: 11, minutes: 15 }
       * @return {Duration}
       */
      normalize() {
        if (!this.isValid) return this;
        const vals = this.toObject();
        normalizeValues(this.matrix, vals);
        return clone(this, { values: vals }, true);
      }

      /**
       * Convert this Duration into its representation in a different set of units.
       * @example Duration.fromObject({ hours: 1, seconds: 30 }).shiftTo('minutes', 'milliseconds').toObject() //=> { minutes: 60, milliseconds: 30000 }
       * @return {Duration}
       */
      shiftTo(...units) {
        if (!this.isValid) return this;

        if (units.length === 0) {
          return this;
        }

        units = units.map(u => Duration.normalizeUnit(u));

        const built = {},
          accumulated = {},
          vals = this.toObject();
        let lastUnit;

        for (const k of orderedUnits) {
          if (units.indexOf(k) >= 0) {
            lastUnit = k;

            let own = 0;

            // anything we haven't boiled down yet should get boiled to this unit
            for (const ak in accumulated) {
              own += this.matrix[ak][k] * accumulated[ak];
              accumulated[ak] = 0;
            }

            // plus anything that's already in this unit
            if (isNumber(vals[k])) {
              own += vals[k];
            }

            const i = Math.trunc(own);
            built[k] = i;
            accumulated[k] = own - i; // we'd like to absorb these fractions in another unit

            // plus anything further down the chain that should be rolled up in to this
            for (const down in vals) {
              if (orderedUnits.indexOf(down) > orderedUnits.indexOf(k)) {
                convert(this.matrix, vals, down, built, k);
              }
            }
            // otherwise, keep it in the wings to boil it later
          } else if (isNumber(vals[k])) {
            accumulated[k] = vals[k];
          }
        }

        // anything leftover becomes the decimal for the last unit
        // lastUnit must be defined since units is not empty
        for (const key in accumulated) {
          if (accumulated[key] !== 0) {
            built[lastUnit] +=
              key === lastUnit ? accumulated[key] : accumulated[key] / this.matrix[lastUnit][key];
          }
        }

        return clone(this, { values: built }, true).normalize();
      }

      /**
       * Return the negative of this Duration.
       * @example Duration.fromObject({ hours: 1, seconds: 30 }).negate().toObject() //=> { hours: -1, seconds: -30 }
       * @return {Duration}
       */
      negate() {
        if (!this.isValid) return this;
        const negated = {};
        for (const k of Object.keys(this.values)) {
          negated[k] = -this.values[k];
        }
        return clone(this, { values: negated }, true);
      }

      /**
       * Get the years.
       * @type {number}
       */
      get years() {
        return this.isValid ? this.values.years || 0 : NaN;
      }

      /**
       * Get the quarters.
       * @type {number}
       */
      get quarters() {
        return this.isValid ? this.values.quarters || 0 : NaN;
      }

      /**
       * Get the months.
       * @type {number}
       */
      get months() {
        return this.isValid ? this.values.months || 0 : NaN;
      }

      /**
       * Get the weeks
       * @type {number}
       */
      get weeks() {
        return this.isValid ? this.values.weeks || 0 : NaN;
      }

      /**
       * Get the days.
       * @type {number}
       */
      get days() {
        return this.isValid ? this.values.days || 0 : NaN;
      }

      /**
       * Get the hours.
       * @type {number}
       */
      get hours() {
        return this.isValid ? this.values.hours || 0 : NaN;
      }

      /**
       * Get the minutes.
       * @type {number}
       */
      get minutes() {
        return this.isValid ? this.values.minutes || 0 : NaN;
      }

      /**
       * Get the seconds.
       * @return {number}
       */
      get seconds() {
        return this.isValid ? this.values.seconds || 0 : NaN;
      }

      /**
       * Get the milliseconds.
       * @return {number}
       */
      get milliseconds() {
        return this.isValid ? this.values.milliseconds || 0 : NaN;
      }

      /**
       * Returns whether the Duration is invalid. Invalid durations are returned by diff operations
       * on invalid DateTimes or Intervals.
       * @return {boolean}
       */
      get isValid() {
        return this.invalid === null;
      }

      /**
       * Returns an error code if this Duration became invalid, or null if the Duration is valid
       * @return {string}
       */
      get invalidReason() {
        return this.invalid ? this.invalid.reason : null;
      }

      /**
       * Returns an explanation of why this Duration became invalid, or null if the Duration is valid
       * @type {string}
       */
      get invalidExplanation() {
        return this.invalid ? this.invalid.explanation : null;
      }

      /**
       * Equality check
       * Two Durations are equal iff they have the same units and the same values for each unit.
       * @param {Duration} other
       * @return {boolean}
       */
      equals(other) {
        if (!this.isValid || !other.isValid) {
          return false;
        }

        if (!this.loc.equals(other.loc)) {
          return false;
        }

        function eq(v1, v2) {
          // Consider 0 and undefined as equal
          if (v1 === undefined || v1 === 0) return v2 === undefined || v2 === 0;
          return v1 === v2;
        }

        for (const u of orderedUnits) {
          if (!eq(this.values[u], other.values[u])) {
            return false;
          }
        }
        return true;
      }
    }

    /**
     * @private
     */
    function friendlyDuration(durationish) {
      if (isNumber(durationish)) {
        return Duration.fromMillis(durationish);
      } else if (Duration.isDuration(durationish)) {
        return durationish;
      } else if (typeof durationish === "object") {
        return Duration.fromObject(durationish);
      } else {
        throw new InvalidArgumentError(
          `Unknown duration argument ${durationish} of type ${typeof durationish}`
        );
      }
    }

    const INVALID$1 = "Invalid Interval";

    // checks if the start is equal to or before the end
    function validateStartEnd(start, end) {
      if (!start || !start.isValid) {
        return Interval.invalid("missing or invalid start");
      } else if (!end || !end.isValid) {
        return Interval.invalid("missing or invalid end");
      } else if (end < start) {
        return Interval.invalid(
          "end before start",
          `The end of an interval must be after its start, but you had start=${start.toISO()} and end=${end.toISO()}`
        );
      } else {
        return null;
      }
    }

    /**
     * An Interval object represents a half-open interval of time, where each endpoint is a {@link DateTime}. Conceptually, it's a container for those two endpoints, accompanied by methods for creating, parsing, interrogating, comparing, transforming, and formatting them.
     *
     * Here is a brief overview of the most commonly used methods and getters in Interval:
     *
     * * **Creation** To create an Interval, use {@link fromDateTimes}, {@link after}, {@link before}, or {@link fromISO}.
     * * **Accessors** Use {@link start} and {@link end} to get the start and end.
     * * **Interrogation** To analyze the Interval, use {@link count}, {@link length}, {@link hasSame}, {@link contains}, {@link isAfter}, or {@link isBefore}.
     * * **Transformation** To create other Intervals out of this one, use {@link set}, {@link splitAt}, {@link splitBy}, {@link divideEqually}, {@link merge}, {@link xor}, {@link union}, {@link intersection}, or {@link difference}.
     * * **Comparison** To compare this Interval to another one, use {@link equals}, {@link overlaps}, {@link abutsStart}, {@link abutsEnd}, {@link engulfs}.
     * * **Output** To convert the Interval into other representations, see {@link toString}, {@link toISO}, {@link toISODate}, {@link toISOTime}, {@link toFormat}, and {@link toDuration}.
     */
    class Interval {
      /**
       * @private
       */
      constructor(config) {
        /**
         * @access private
         */
        this.s = config.start;
        /**
         * @access private
         */
        this.e = config.end;
        /**
         * @access private
         */
        this.invalid = config.invalid || null;
        /**
         * @access private
         */
        this.isLuxonInterval = true;
      }

      /**
       * Create an invalid Interval.
       * @param {string} reason - simple string of why this Interval is invalid. Should not contain parameters or anything else data-dependent
       * @param {string} [explanation=null] - longer explanation, may include parameters and other useful debugging information
       * @return {Interval}
       */
      static invalid(reason, explanation = null) {
        if (!reason) {
          throw new InvalidArgumentError("need to specify a reason the Interval is invalid");
        }

        const invalid = reason instanceof Invalid ? reason : new Invalid(reason, explanation);

        if (Settings.throwOnInvalid) {
          throw new InvalidIntervalError(invalid);
        } else {
          return new Interval({ invalid });
        }
      }

      /**
       * Create an Interval from a start DateTime and an end DateTime. Inclusive of the start but not the end.
       * @param {DateTime|Date|Object} start
       * @param {DateTime|Date|Object} end
       * @return {Interval}
       */
      static fromDateTimes(start, end) {
        const builtStart = friendlyDateTime(start),
          builtEnd = friendlyDateTime(end);

        const validateError = validateStartEnd(builtStart, builtEnd);

        if (validateError == null) {
          return new Interval({
            start: builtStart,
            end: builtEnd
          });
        } else {
          return validateError;
        }
      }

      /**
       * Create an Interval from a start DateTime and a Duration to extend to.
       * @param {DateTime|Date|Object} start
       * @param {Duration|Object|number} duration - the length of the Interval.
       * @return {Interval}
       */
      static after(start, duration) {
        const dur = friendlyDuration(duration),
          dt = friendlyDateTime(start);
        return Interval.fromDateTimes(dt, dt.plus(dur));
      }

      /**
       * Create an Interval from an end DateTime and a Duration to extend backwards to.
       * @param {DateTime|Date|Object} end
       * @param {Duration|Object|number} duration - the length of the Interval.
       * @return {Interval}
       */
      static before(end, duration) {
        const dur = friendlyDuration(duration),
          dt = friendlyDateTime(end);
        return Interval.fromDateTimes(dt.minus(dur), dt);
      }

      /**
       * Create an Interval from an ISO 8601 string.
       * Accepts `<start>/<end>`, `<start>/<duration>`, and `<duration>/<end>` formats.
       * @param {string} text - the ISO string to parse
       * @param {Object} [opts] - options to pass {@link DateTime.fromISO} and optionally {@link Duration.fromISO}
       * @see https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
       * @return {Interval}
       */
      static fromISO(text, opts) {
        const [s, e] = (text || "").split("/", 2);
        if (s && e) {
          let start, startIsValid;
          try {
            start = DateTime.fromISO(s, opts);
            startIsValid = start.isValid;
          } catch (e) {
            startIsValid = false;
          }

          let end, endIsValid;
          try {
            end = DateTime.fromISO(e, opts);
            endIsValid = end.isValid;
          } catch (e) {
            endIsValid = false;
          }

          if (startIsValid && endIsValid) {
            return Interval.fromDateTimes(start, end);
          }

          if (startIsValid) {
            const dur = Duration.fromISO(e, opts);
            if (dur.isValid) {
              return Interval.after(start, dur);
            }
          } else if (endIsValid) {
            const dur = Duration.fromISO(s, opts);
            if (dur.isValid) {
              return Interval.before(end, dur);
            }
          }
        }
        return Interval.invalid("unparsable", `the input "${text}" can't be parsed as ISO 8601`);
      }

      /**
       * Check if an object is an Interval. Works across context boundaries
       * @param {object} o
       * @return {boolean}
       */
      static isInterval(o) {
        return (o && o.isLuxonInterval) || false;
      }

      /**
       * Returns the start of the Interval
       * @type {DateTime}
       */
      get start() {
        return this.isValid ? this.s : null;
      }

      /**
       * Returns the end of the Interval
       * @type {DateTime}
       */
      get end() {
        return this.isValid ? this.e : null;
      }

      /**
       * Returns whether this Interval's end is at least its start, meaning that the Interval isn't 'backwards'.
       * @type {boolean}
       */
      get isValid() {
        return this.invalidReason === null;
      }

      /**
       * Returns an error code if this Interval is invalid, or null if the Interval is valid
       * @type {string}
       */
      get invalidReason() {
        return this.invalid ? this.invalid.reason : null;
      }

      /**
       * Returns an explanation of why this Interval became invalid, or null if the Interval is valid
       * @type {string}
       */
      get invalidExplanation() {
        return this.invalid ? this.invalid.explanation : null;
      }

      /**
       * Returns the length of the Interval in the specified unit.
       * @param {string} unit - the unit (such as 'hours' or 'days') to return the length in.
       * @return {number}
       */
      length(unit = "milliseconds") {
        return this.isValid ? this.toDuration(...[unit]).get(unit) : NaN;
      }

      /**
       * Returns the count of minutes, hours, days, months, or years included in the Interval, even in part.
       * Unlike {@link length} this counts sections of the calendar, not periods of time, e.g. specifying 'day'
       * asks 'what dates are included in this interval?', not 'how many days long is this interval?'
       * @param {string} [unit='milliseconds'] - the unit of time to count.
       * @return {number}
       */
      count(unit = "milliseconds") {
        if (!this.isValid) return NaN;
        const start = this.start.startOf(unit),
          end = this.end.startOf(unit);
        return Math.floor(end.diff(start, unit).get(unit)) + 1;
      }

      /**
       * Returns whether this Interval's start and end are both in the same unit of time
       * @param {string} unit - the unit of time to check sameness on
       * @return {boolean}
       */
      hasSame(unit) {
        return this.isValid ? this.isEmpty() || this.e.minus(1).hasSame(this.s, unit) : false;
      }

      /**
       * Return whether this Interval has the same start and end DateTimes.
       * @return {boolean}
       */
      isEmpty() {
        return this.s.valueOf() === this.e.valueOf();
      }

      /**
       * Return whether this Interval's start is after the specified DateTime.
       * @param {DateTime} dateTime
       * @return {boolean}
       */
      isAfter(dateTime) {
        if (!this.isValid) return false;
        return this.s > dateTime;
      }

      /**
       * Return whether this Interval's end is before the specified DateTime.
       * @param {DateTime} dateTime
       * @return {boolean}
       */
      isBefore(dateTime) {
        if (!this.isValid) return false;
        return this.e <= dateTime;
      }

      /**
       * Return whether this Interval contains the specified DateTime.
       * @param {DateTime} dateTime
       * @return {boolean}
       */
      contains(dateTime) {
        if (!this.isValid) return false;
        return this.s <= dateTime && this.e > dateTime;
      }

      /**
       * "Sets" the start and/or end dates. Returns a newly-constructed Interval.
       * @param {Object} values - the values to set
       * @param {DateTime} values.start - the starting DateTime
       * @param {DateTime} values.end - the ending DateTime
       * @return {Interval}
       */
      set({ start, end } = {}) {
        if (!this.isValid) return this;
        return Interval.fromDateTimes(start || this.s, end || this.e);
      }

      /**
       * Split this Interval at each of the specified DateTimes
       * @param {...[DateTime]} dateTimes - the unit of time to count.
       * @return {[Interval]}
       */
      splitAt(...dateTimes) {
        if (!this.isValid) return [];
        const sorted = dateTimes
            .map(friendlyDateTime)
            .filter(d => this.contains(d))
            .sort(),
          results = [];
        let { s } = this,
          i = 0;

        while (s < this.e) {
          const added = sorted[i] || this.e,
            next = +added > +this.e ? this.e : added;
          results.push(Interval.fromDateTimes(s, next));
          s = next;
          i += 1;
        }

        return results;
      }

      /**
       * Split this Interval into smaller Intervals, each of the specified length.
       * Left over time is grouped into a smaller interval
       * @param {Duration|Object|number} duration - The length of each resulting interval.
       * @return {[Interval]}
       */
      splitBy(duration) {
        const dur = friendlyDuration(duration);

        if (!this.isValid || !dur.isValid || dur.as("milliseconds") === 0) {
          return [];
        }

        let { s } = this,
          added,
          next;

        const results = [];
        while (s < this.e) {
          added = s.plus(dur);
          next = +added > +this.e ? this.e : added;
          results.push(Interval.fromDateTimes(s, next));
          s = next;
        }

        return results;
      }

      /**
       * Split this Interval into the specified number of smaller intervals.
       * @param {number} numberOfParts - The number of Intervals to divide the Interval into.
       * @return {[Interval]}
       */
      divideEqually(numberOfParts) {
        if (!this.isValid) return [];
        return this.splitBy(this.length() / numberOfParts).slice(0, numberOfParts);
      }

      /**
       * Return whether this Interval overlaps with the specified Interval
       * @param {Interval} other
       * @return {boolean}
       */
      overlaps(other) {
        return this.e > other.s && this.s < other.e;
      }

      /**
       * Return whether this Interval's end is adjacent to the specified Interval's start.
       * @param {Interval} other
       * @return {boolean}
       */
      abutsStart(other) {
        if (!this.isValid) return false;
        return +this.e === +other.s;
      }

      /**
       * Return whether this Interval's start is adjacent to the specified Interval's end.
       * @param {Interval} other
       * @return {boolean}
       */
      abutsEnd(other) {
        if (!this.isValid) return false;
        return +other.e === +this.s;
      }

      /**
       * Return whether this Interval engulfs the start and end of the specified Interval.
       * @param {Interval} other
       * @return {boolean}
       */
      engulfs(other) {
        if (!this.isValid) return false;
        return this.s <= other.s && this.e >= other.e;
      }

      /**
       * Return whether this Interval has the same start and end as the specified Interval.
       * @param {Interval} other
       * @return {boolean}
       */
      equals(other) {
        if (!this.isValid || !other.isValid) {
          return false;
        }

        return this.s.equals(other.s) && this.e.equals(other.e);
      }

      /**
       * Return an Interval representing the intersection of this Interval and the specified Interval.
       * Specifically, the resulting Interval has the maximum start time and the minimum end time of the two Intervals.
       * Returns null if the intersection is empty, meaning, the intervals don't intersect.
       * @param {Interval} other
       * @return {Interval}
       */
      intersection(other) {
        if (!this.isValid) return this;
        const s = this.s > other.s ? this.s : other.s,
          e = this.e < other.e ? this.e : other.e;

        if (s > e) {
          return null;
        } else {
          return Interval.fromDateTimes(s, e);
        }
      }

      /**
       * Return an Interval representing the union of this Interval and the specified Interval.
       * Specifically, the resulting Interval has the minimum start time and the maximum end time of the two Intervals.
       * @param {Interval} other
       * @return {Interval}
       */
      union(other) {
        if (!this.isValid) return this;
        const s = this.s < other.s ? this.s : other.s,
          e = this.e > other.e ? this.e : other.e;
        return Interval.fromDateTimes(s, e);
      }

      /**
       * Merge an array of Intervals into a equivalent minimal set of Intervals.
       * Combines overlapping and adjacent Intervals.
       * @param {[Interval]} intervals
       * @return {[Interval]}
       */
      static merge(intervals) {
        const [found, final] = intervals.sort((a, b) => a.s - b.s).reduce(
          ([sofar, current], item) => {
            if (!current) {
              return [sofar, item];
            } else if (current.overlaps(item) || current.abutsStart(item)) {
              return [sofar, current.union(item)];
            } else {
              return [sofar.concat([current]), item];
            }
          },
          [[], null]
        );
        if (final) {
          found.push(final);
        }
        return found;
      }

      /**
       * Return an array of Intervals representing the spans of time that only appear in one of the specified Intervals.
       * @param {[Interval]} intervals
       * @return {[Interval]}
       */
      static xor(intervals) {
        let start = null,
          currentCount = 0;
        const results = [],
          ends = intervals.map(i => [{ time: i.s, type: "s" }, { time: i.e, type: "e" }]),
          flattened = Array.prototype.concat(...ends),
          arr = flattened.sort((a, b) => a.time - b.time);

        for (const i of arr) {
          currentCount += i.type === "s" ? 1 : -1;

          if (currentCount === 1) {
            start = i.time;
          } else {
            if (start && +start !== +i.time) {
              results.push(Interval.fromDateTimes(start, i.time));
            }

            start = null;
          }
        }

        return Interval.merge(results);
      }

      /**
       * Return an Interval representing the span of time in this Interval that doesn't overlap with any of the specified Intervals.
       * @param {...Interval} intervals
       * @return {[Interval]}
       */
      difference(...intervals) {
        return Interval.xor([this].concat(intervals))
          .map(i => this.intersection(i))
          .filter(i => i && !i.isEmpty());
      }

      /**
       * Returns a string representation of this Interval appropriate for debugging.
       * @return {string}
       */
      toString() {
        if (!this.isValid) return INVALID$1;
        return `[${this.s.toISO()} – ${this.e.toISO()})`;
      }

      /**
       * Returns an ISO 8601-compliant string representation of this Interval.
       * @see https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
       * @param {Object} opts - The same options as {@link DateTime.toISO}
       * @return {string}
       */
      toISO(opts) {
        if (!this.isValid) return INVALID$1;
        return `${this.s.toISO(opts)}/${this.e.toISO(opts)}`;
      }

      /**
       * Returns an ISO 8601-compliant string representation of date of this Interval.
       * The time components are ignored.
       * @see https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
       * @return {string}
       */
      toISODate() {
        if (!this.isValid) return INVALID$1;
        return `${this.s.toISODate()}/${this.e.toISODate()}`;
      }

      /**
       * Returns an ISO 8601-compliant string representation of time of this Interval.
       * The date components are ignored.
       * @see https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
       * @param {Object} opts - The same options as {@link DateTime.toISO}
       * @return {string}
       */
      toISOTime(opts) {
        if (!this.isValid) return INVALID$1;
        return `${this.s.toISOTime(opts)}/${this.e.toISOTime(opts)}`;
      }

      /**
       * Returns a string representation of this Interval formatted according to the specified format string.
       * @param {string} dateFormat - the format string. This string formats the start and end time. See {@link DateTime.toFormat} for details.
       * @param {Object} opts - options
       * @param {string} [opts.separator =  ' – '] - a separator to place between the start and end representations
       * @return {string}
       */
      toFormat(dateFormat, { separator = " – " } = {}) {
        if (!this.isValid) return INVALID$1;
        return `${this.s.toFormat(dateFormat)}${separator}${this.e.toFormat(dateFormat)}`;
      }

      /**
       * Return a Duration representing the time spanned by this interval.
       * @param {string|string[]} [unit=['milliseconds']] - the unit or units (such as 'hours' or 'days') to include in the duration.
       * @param {Object} opts - options that affect the creation of the Duration
       * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
       * @example Interval.fromDateTimes(dt1, dt2).toDuration().toObject() //=> { milliseconds: 88489257 }
       * @example Interval.fromDateTimes(dt1, dt2).toDuration('days').toObject() //=> { days: 1.0241812152777778 }
       * @example Interval.fromDateTimes(dt1, dt2).toDuration(['hours', 'minutes']).toObject() //=> { hours: 24, minutes: 34.82095 }
       * @example Interval.fromDateTimes(dt1, dt2).toDuration(['hours', 'minutes', 'seconds']).toObject() //=> { hours: 24, minutes: 34, seconds: 49.257 }
       * @example Interval.fromDateTimes(dt1, dt2).toDuration('seconds').toObject() //=> { seconds: 88489.257 }
       * @return {Duration}
       */
      toDuration(unit, opts) {
        if (!this.isValid) {
          return Duration.invalid(this.invalidReason);
        }
        return this.e.diff(this.s, unit, opts);
      }

      /**
       * Run mapFn on the interval start and end, returning a new Interval from the resulting DateTimes
       * @param {function} mapFn
       * @return {Interval}
       * @example Interval.fromDateTimes(dt1, dt2).mapEndpoints(endpoint => endpoint.toUTC())
       * @example Interval.fromDateTimes(dt1, dt2).mapEndpoints(endpoint => endpoint.plus({ hours: 2 }))
       */
      mapEndpoints(mapFn) {
        return Interval.fromDateTimes(mapFn(this.s), mapFn(this.e));
      }
    }

    /**
     * The Info class contains static methods for retrieving general time and date related data. For example, it has methods for finding out if a time zone has a DST, for listing the months in any supported locale, and for discovering which of Luxon features are available in the current environment.
     */
    class Info {
      /**
       * Return whether the specified zone contains a DST.
       * @param {string|Zone} [zone='local'] - Zone to check. Defaults to the environment's local zone.
       * @return {boolean}
       */
      static hasDST(zone = Settings.defaultZone) {
        const proto = DateTime.now()
          .setZone(zone)
          .set({ month: 12 });

        return !zone.universal && proto.offset !== proto.set({ month: 6 }).offset;
      }

      /**
       * Return whether the specified zone is a valid IANA specifier.
       * @param {string} zone - Zone to check
       * @return {boolean}
       */
      static isValidIANAZone(zone) {
        return IANAZone.isValidSpecifier(zone) && IANAZone.isValidZone(zone);
      }

      /**
       * Converts the input into a {@link Zone} instance.
       *
       * * If `input` is already a Zone instance, it is returned unchanged.
       * * If `input` is a string containing a valid time zone name, a Zone instance
       *   with that name is returned.
       * * If `input` is a string that doesn't refer to a known time zone, a Zone
       *   instance with {@link Zone.isValid} == false is returned.
       * * If `input is a number, a Zone instance with the specified fixed offset
       *   in minutes is returned.
       * * If `input` is `null` or `undefined`, the default zone is returned.
       * @param {string|Zone|number} [input] - the value to be converted
       * @return {Zone}
       */
      static normalizeZone(input) {
        return normalizeZone(input, Settings.defaultZone);
      }

      /**
       * Return an array of standalone month names.
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
       * @param {string} [length='long'] - the length of the month representation, such as "numeric", "2-digit", "narrow", "short", "long"
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @param {string} [opts.numberingSystem=null] - the numbering system
       * @param {string} [opts.outputCalendar='gregory'] - the calendar
       * @example Info.months()[0] //=> 'January'
       * @example Info.months('short')[0] //=> 'Jan'
       * @example Info.months('numeric')[0] //=> '1'
       * @example Info.months('short', { locale: 'fr-CA' } )[0] //=> 'janv.'
       * @example Info.months('numeric', { locale: 'ar' })[0] //=> '١'
       * @example Info.months('long', { outputCalendar: 'islamic' })[0] //=> 'Rabiʻ I'
       * @return {[string]}
       */
      static months(
        length = "long",
        { locale = null, numberingSystem = null, outputCalendar = "gregory" } = {}
      ) {
        return Locale.create(locale, numberingSystem, outputCalendar).months(length);
      }

      /**
       * Return an array of format month names.
       * Format months differ from standalone months in that they're meant to appear next to the day of the month. In some languages, that
       * changes the string.
       * See {@link months}
       * @param {string} [length='long'] - the length of the month representation, such as "numeric", "2-digit", "narrow", "short", "long"
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @param {string} [opts.numberingSystem=null] - the numbering system
       * @param {string} [opts.outputCalendar='gregory'] - the calendar
       * @return {[string]}
       */
      static monthsFormat(
        length = "long",
        { locale = null, numberingSystem = null, outputCalendar = "gregory" } = {}
      ) {
        return Locale.create(locale, numberingSystem, outputCalendar).months(length, true);
      }

      /**
       * Return an array of standalone week names.
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
       * @param {string} [length='long'] - the length of the weekday representation, such as "narrow", "short", "long".
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @param {string} [opts.numberingSystem=null] - the numbering system
       * @example Info.weekdays()[0] //=> 'Monday'
       * @example Info.weekdays('short')[0] //=> 'Mon'
       * @example Info.weekdays('short', { locale: 'fr-CA' })[0] //=> 'lun.'
       * @example Info.weekdays('short', { locale: 'ar' })[0] //=> 'الاثنين'
       * @return {[string]}
       */
      static weekdays(length = "long", { locale = null, numberingSystem = null } = {}) {
        return Locale.create(locale, numberingSystem, null).weekdays(length);
      }

      /**
       * Return an array of format week names.
       * Format weekdays differ from standalone weekdays in that they're meant to appear next to more date information. In some languages, that
       * changes the string.
       * See {@link weekdays}
       * @param {string} [length='long'] - the length of the weekday representation, such as "narrow", "short", "long".
       * @param {Object} opts - options
       * @param {string} [opts.locale=null] - the locale code
       * @param {string} [opts.numberingSystem=null] - the numbering system
       * @return {[string]}
       */
      static weekdaysFormat(length = "long", { locale = null, numberingSystem = null } = {}) {
        return Locale.create(locale, numberingSystem, null).weekdays(length, true);
      }

      /**
       * Return an array of meridiems.
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @example Info.meridiems() //=> [ 'AM', 'PM' ]
       * @example Info.meridiems({ locale: 'my' }) //=> [ 'နံနက်', 'ညနေ' ]
       * @return {[string]}
       */
      static meridiems({ locale = null } = {}) {
        return Locale.create(locale).meridiems();
      }

      /**
       * Return an array of eras, such as ['BC', 'AD']. The locale can be specified, but the calendar system is always Gregorian.
       * @param {string} [length='short'] - the length of the era representation, such as "short" or "long".
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @example Info.eras() //=> [ 'BC', 'AD' ]
       * @example Info.eras('long') //=> [ 'Before Christ', 'Anno Domini' ]
       * @example Info.eras('long', { locale: 'fr' }) //=> [ 'avant Jésus-Christ', 'après Jésus-Christ' ]
       * @return {[string]}
       */
      static eras(length = "short", { locale = null } = {}) {
        return Locale.create(locale, null, "gregory").eras(length);
      }

      /**
       * Return the set of available features in this environment.
       * Some features of Luxon are not available in all environments. For example, on older browsers, timezone support is not available. Use this function to figure out if that's the case.
       * Keys:
       * * `zones`: whether this environment supports IANA timezones
       * * `intlTokens`: whether this environment supports internationalized token-based formatting/parsing
       * * `intl`: whether this environment supports general internationalization
       * * `relative`: whether this environment supports relative time formatting
       * @example Info.features() //=> { intl: true, intlTokens: false, zones: true, relative: false }
       * @return {Object}
       */
      static features() {
        let intl = false,
          intlTokens = false,
          zones = false,
          relative = false;

        if (hasIntl()) {
          intl = true;
          intlTokens = hasFormatToParts();
          relative = hasRelative();

          try {
            zones =
              new Intl.DateTimeFormat("en", { timeZone: "America/New_York" }).resolvedOptions()
                .timeZone === "America/New_York";
          } catch (e) {
            zones = false;
          }
        }

        return { intl, intlTokens, zones, relative };
      }
    }

    function dayDiff(earlier, later) {
      const utcDayStart = dt =>
          dt
            .toUTC(0, { keepLocalTime: true })
            .startOf("day")
            .valueOf(),
        ms = utcDayStart(later) - utcDayStart(earlier);
      return Math.floor(Duration.fromMillis(ms).as("days"));
    }

    function highOrderDiffs(cursor, later, units) {
      const differs = [
        ["years", (a, b) => b.year - a.year],
        ["quarters", (a, b) => b.quarter - a.quarter],
        ["months", (a, b) => b.month - a.month + (b.year - a.year) * 12],
        [
          "weeks",
          (a, b) => {
            const days = dayDiff(a, b);
            return (days - (days % 7)) / 7;
          }
        ],
        ["days", dayDiff]
      ];

      const results = {};
      let lowestOrder, highWater;

      for (const [unit, differ] of differs) {
        if (units.indexOf(unit) >= 0) {
          lowestOrder = unit;

          let delta = differ(cursor, later);
          highWater = cursor.plus({ [unit]: delta });

          if (highWater > later) {
            cursor = cursor.plus({ [unit]: delta - 1 });
            delta -= 1;
          } else {
            cursor = highWater;
          }

          results[unit] = delta;
        }
      }

      return [cursor, results, highWater, lowestOrder];
    }

    function diff(earlier, later, units, opts) {
      let [cursor, results, highWater, lowestOrder] = highOrderDiffs(earlier, later, units);

      const remainingMillis = later - cursor;

      const lowerOrderUnits = units.filter(
        u => ["hours", "minutes", "seconds", "milliseconds"].indexOf(u) >= 0
      );

      if (lowerOrderUnits.length === 0) {
        if (highWater < later) {
          highWater = cursor.plus({ [lowestOrder]: 1 });
        }

        if (highWater !== cursor) {
          results[lowestOrder] = (results[lowestOrder] || 0) + remainingMillis / (highWater - cursor);
        }
      }

      const duration = Duration.fromObject(Object.assign(results, opts));

      if (lowerOrderUnits.length > 0) {
        return Duration.fromMillis(remainingMillis, opts)
          .shiftTo(...lowerOrderUnits)
          .plus(duration);
      } else {
        return duration;
      }
    }

    const numberingSystems = {
      arab: "[\u0660-\u0669]",
      arabext: "[\u06F0-\u06F9]",
      bali: "[\u1B50-\u1B59]",
      beng: "[\u09E6-\u09EF]",
      deva: "[\u0966-\u096F]",
      fullwide: "[\uFF10-\uFF19]",
      gujr: "[\u0AE6-\u0AEF]",
      hanidec: "[〇|一|二|三|四|五|六|七|八|九]",
      khmr: "[\u17E0-\u17E9]",
      knda: "[\u0CE6-\u0CEF]",
      laoo: "[\u0ED0-\u0ED9]",
      limb: "[\u1946-\u194F]",
      mlym: "[\u0D66-\u0D6F]",
      mong: "[\u1810-\u1819]",
      mymr: "[\u1040-\u1049]",
      orya: "[\u0B66-\u0B6F]",
      tamldec: "[\u0BE6-\u0BEF]",
      telu: "[\u0C66-\u0C6F]",
      thai: "[\u0E50-\u0E59]",
      tibt: "[\u0F20-\u0F29]",
      latn: "\\d"
    };

    const numberingSystemsUTF16 = {
      arab: [1632, 1641],
      arabext: [1776, 1785],
      bali: [6992, 7001],
      beng: [2534, 2543],
      deva: [2406, 2415],
      fullwide: [65296, 65303],
      gujr: [2790, 2799],
      khmr: [6112, 6121],
      knda: [3302, 3311],
      laoo: [3792, 3801],
      limb: [6470, 6479],
      mlym: [3430, 3439],
      mong: [6160, 6169],
      mymr: [4160, 4169],
      orya: [2918, 2927],
      tamldec: [3046, 3055],
      telu: [3174, 3183],
      thai: [3664, 3673],
      tibt: [3872, 3881]
    };

    // eslint-disable-next-line
    const hanidecChars = numberingSystems.hanidec.replace(/[\[|\]]/g, "").split("");

    function parseDigits(str) {
      let value = parseInt(str, 10);
      if (isNaN(value)) {
        value = "";
        for (let i = 0; i < str.length; i++) {
          const code = str.charCodeAt(i);

          if (str[i].search(numberingSystems.hanidec) !== -1) {
            value += hanidecChars.indexOf(str[i]);
          } else {
            for (const key in numberingSystemsUTF16) {
              const [min, max] = numberingSystemsUTF16[key];
              if (code >= min && code <= max) {
                value += code - min;
              }
            }
          }
        }
        return parseInt(value, 10);
      } else {
        return value;
      }
    }

    function digitRegex({ numberingSystem }, append = "") {
      return new RegExp(`${numberingSystems[numberingSystem || "latn"]}${append}`);
    }

    const MISSING_FTP = "missing Intl.DateTimeFormat.formatToParts support";

    function intUnit(regex, post = i => i) {
      return { regex, deser: ([s]) => post(parseDigits(s)) };
    }

    const NBSP = String.fromCharCode(160);
    const spaceOrNBSP = `( |${NBSP})`;
    const spaceOrNBSPRegExp = new RegExp(spaceOrNBSP, "g");

    function fixListRegex(s) {
      // make dots optional and also make them literal
      // make space and non breakable space characters interchangeable
      return s.replace(/\./g, "\\.?").replace(spaceOrNBSPRegExp, spaceOrNBSP);
    }

    function stripInsensitivities(s) {
      return s
        .replace(/\./g, "") // ignore dots that were made optional
        .replace(spaceOrNBSPRegExp, " ") // interchange space and nbsp
        .toLowerCase();
    }

    function oneOf(strings, startIndex) {
      if (strings === null) {
        return null;
      } else {
        return {
          regex: RegExp(strings.map(fixListRegex).join("|")),
          deser: ([s]) =>
            strings.findIndex(i => stripInsensitivities(s) === stripInsensitivities(i)) + startIndex
        };
      }
    }

    function offset(regex, groups) {
      return { regex, deser: ([, h, m]) => signedOffset(h, m), groups };
    }

    function simple(regex) {
      return { regex, deser: ([s]) => s };
    }

    function escapeToken(value) {
      // eslint-disable-next-line no-useless-escape
      return value.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
    }

    function unitForToken(token, loc) {
      const one = digitRegex(loc),
        two = digitRegex(loc, "{2}"),
        three = digitRegex(loc, "{3}"),
        four = digitRegex(loc, "{4}"),
        six = digitRegex(loc, "{6}"),
        oneOrTwo = digitRegex(loc, "{1,2}"),
        oneToThree = digitRegex(loc, "{1,3}"),
        oneToSix = digitRegex(loc, "{1,6}"),
        oneToNine = digitRegex(loc, "{1,9}"),
        twoToFour = digitRegex(loc, "{2,4}"),
        fourToSix = digitRegex(loc, "{4,6}"),
        literal = t => ({ regex: RegExp(escapeToken(t.val)), deser: ([s]) => s, literal: true }),
        unitate = t => {
          if (token.literal) {
            return literal(t);
          }
          switch (t.val) {
            // era
            case "G":
              return oneOf(loc.eras("short", false), 0);
            case "GG":
              return oneOf(loc.eras("long", false), 0);
            // years
            case "y":
              return intUnit(oneToSix);
            case "yy":
              return intUnit(twoToFour, untruncateYear);
            case "yyyy":
              return intUnit(four);
            case "yyyyy":
              return intUnit(fourToSix);
            case "yyyyyy":
              return intUnit(six);
            // months
            case "M":
              return intUnit(oneOrTwo);
            case "MM":
              return intUnit(two);
            case "MMM":
              return oneOf(loc.months("short", true, false), 1);
            case "MMMM":
              return oneOf(loc.months("long", true, false), 1);
            case "L":
              return intUnit(oneOrTwo);
            case "LL":
              return intUnit(two);
            case "LLL":
              return oneOf(loc.months("short", false, false), 1);
            case "LLLL":
              return oneOf(loc.months("long", false, false), 1);
            // dates
            case "d":
              return intUnit(oneOrTwo);
            case "dd":
              return intUnit(two);
            // ordinals
            case "o":
              return intUnit(oneToThree);
            case "ooo":
              return intUnit(three);
            // time
            case "HH":
              return intUnit(two);
            case "H":
              return intUnit(oneOrTwo);
            case "hh":
              return intUnit(two);
            case "h":
              return intUnit(oneOrTwo);
            case "mm":
              return intUnit(two);
            case "m":
              return intUnit(oneOrTwo);
            case "q":
              return intUnit(oneOrTwo);
            case "qq":
              return intUnit(two);
            case "s":
              return intUnit(oneOrTwo);
            case "ss":
              return intUnit(two);
            case "S":
              return intUnit(oneToThree);
            case "SSS":
              return intUnit(three);
            case "u":
              return simple(oneToNine);
            // meridiem
            case "a":
              return oneOf(loc.meridiems(), 0);
            // weekYear (k)
            case "kkkk":
              return intUnit(four);
            case "kk":
              return intUnit(twoToFour, untruncateYear);
            // weekNumber (W)
            case "W":
              return intUnit(oneOrTwo);
            case "WW":
              return intUnit(two);
            // weekdays
            case "E":
            case "c":
              return intUnit(one);
            case "EEE":
              return oneOf(loc.weekdays("short", false, false), 1);
            case "EEEE":
              return oneOf(loc.weekdays("long", false, false), 1);
            case "ccc":
              return oneOf(loc.weekdays("short", true, false), 1);
            case "cccc":
              return oneOf(loc.weekdays("long", true, false), 1);
            // offset/zone
            case "Z":
            case "ZZ":
              return offset(new RegExp(`([+-]${oneOrTwo.source})(?::(${two.source}))?`), 2);
            case "ZZZ":
              return offset(new RegExp(`([+-]${oneOrTwo.source})(${two.source})?`), 2);
            // we don't support ZZZZ (PST) or ZZZZZ (Pacific Standard Time) in parsing
            // because we don't have any way to figure out what they are
            case "z":
              return simple(/[a-z_+-/]{1,256}?/i);
            default:
              return literal(t);
          }
        };

      const unit = unitate(token) || {
        invalidReason: MISSING_FTP
      };

      unit.token = token;

      return unit;
    }

    const partTypeStyleToTokenVal = {
      year: {
        "2-digit": "yy",
        numeric: "yyyyy"
      },
      month: {
        numeric: "M",
        "2-digit": "MM",
        short: "MMM",
        long: "MMMM"
      },
      day: {
        numeric: "d",
        "2-digit": "dd"
      },
      weekday: {
        short: "EEE",
        long: "EEEE"
      },
      dayperiod: "a",
      dayPeriod: "a",
      hour: {
        numeric: "h",
        "2-digit": "hh"
      },
      minute: {
        numeric: "m",
        "2-digit": "mm"
      },
      second: {
        numeric: "s",
        "2-digit": "ss"
      }
    };

    function tokenForPart(part, locale, formatOpts) {
      const { type, value } = part;

      if (type === "literal") {
        return {
          literal: true,
          val: value
        };
      }

      const style = formatOpts[type];

      let val = partTypeStyleToTokenVal[type];
      if (typeof val === "object") {
        val = val[style];
      }

      if (val) {
        return {
          literal: false,
          val
        };
      }

      return undefined;
    }

    function buildRegex(units) {
      const re = units.map(u => u.regex).reduce((f, r) => `${f}(${r.source})`, "");
      return [`^${re}$`, units];
    }

    function match(input, regex, handlers) {
      const matches = input.match(regex);

      if (matches) {
        const all = {};
        let matchIndex = 1;
        for (const i in handlers) {
          if (hasOwnProperty(handlers, i)) {
            const h = handlers[i],
              groups = h.groups ? h.groups + 1 : 1;
            if (!h.literal && h.token) {
              all[h.token.val[0]] = h.deser(matches.slice(matchIndex, matchIndex + groups));
            }
            matchIndex += groups;
          }
        }
        return [matches, all];
      } else {
        return [matches, {}];
      }
    }

    function dateTimeFromMatches(matches) {
      const toField = token => {
        switch (token) {
          case "S":
            return "millisecond";
          case "s":
            return "second";
          case "m":
            return "minute";
          case "h":
          case "H":
            return "hour";
          case "d":
            return "day";
          case "o":
            return "ordinal";
          case "L":
          case "M":
            return "month";
          case "y":
            return "year";
          case "E":
          case "c":
            return "weekday";
          case "W":
            return "weekNumber";
          case "k":
            return "weekYear";
          case "q":
            return "quarter";
          default:
            return null;
        }
      };

      let zone;
      if (!isUndefined(matches.Z)) {
        zone = new FixedOffsetZone(matches.Z);
      } else if (!isUndefined(matches.z)) {
        zone = IANAZone.create(matches.z);
      } else {
        zone = null;
      }

      if (!isUndefined(matches.q)) {
        matches.M = (matches.q - 1) * 3 + 1;
      }

      if (!isUndefined(matches.h)) {
        if (matches.h < 12 && matches.a === 1) {
          matches.h += 12;
        } else if (matches.h === 12 && matches.a === 0) {
          matches.h = 0;
        }
      }

      if (matches.G === 0 && matches.y) {
        matches.y = -matches.y;
      }

      if (!isUndefined(matches.u)) {
        matches.S = parseMillis(matches.u);
      }

      const vals = Object.keys(matches).reduce((r, k) => {
        const f = toField(k);
        if (f) {
          r[f] = matches[k];
        }

        return r;
      }, {});

      return [vals, zone];
    }

    let dummyDateTimeCache = null;

    function getDummyDateTime() {
      if (!dummyDateTimeCache) {
        dummyDateTimeCache = DateTime.fromMillis(1555555555555);
      }

      return dummyDateTimeCache;
    }

    function maybeExpandMacroToken(token, locale) {
      if (token.literal) {
        return token;
      }

      const formatOpts = Formatter.macroTokenToFormatOpts(token.val);

      if (!formatOpts) {
        return token;
      }

      const formatter = Formatter.create(locale, formatOpts);
      const parts = formatter.formatDateTimeParts(getDummyDateTime());

      const tokens = parts.map(p => tokenForPart(p, locale, formatOpts));

      if (tokens.includes(undefined)) {
        return token;
      }

      return tokens;
    }

    function expandMacroTokens(tokens, locale) {
      return Array.prototype.concat(...tokens.map(t => maybeExpandMacroToken(t, locale)));
    }

    /**
     * @private
     */

    function explainFromTokens(locale, input, format) {
      const tokens = expandMacroTokens(Formatter.parseFormat(format), locale),
        units = tokens.map(t => unitForToken(t, locale)),
        disqualifyingUnit = units.find(t => t.invalidReason);

      if (disqualifyingUnit) {
        return { input, tokens, invalidReason: disqualifyingUnit.invalidReason };
      } else {
        const [regexString, handlers] = buildRegex(units),
          regex = RegExp(regexString, "i"),
          [rawMatches, matches] = match(input, regex, handlers),
          [result, zone] = matches ? dateTimeFromMatches(matches) : [null, null];
        if (hasOwnProperty(matches, "a") && hasOwnProperty(matches, "H")) {
          throw new ConflictingSpecificationError(
            "Can't include meridiem when specifying 24-hour format"
          );
        }
        return { input, tokens, regex, rawMatches, matches, result, zone };
      }
    }

    function parseFromTokens(locale, input, format) {
      const { result, zone, invalidReason } = explainFromTokens(locale, input, format);
      return [result, zone, invalidReason];
    }

    const nonLeapLadder = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334],
      leapLadder = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

    function unitOutOfRange(unit, value) {
      return new Invalid(
        "unit out of range",
        `you specified ${value} (of type ${typeof value}) as a ${unit}, which is invalid`
      );
    }

    function dayOfWeek(year, month, day) {
      const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      return js === 0 ? 7 : js;
    }

    function computeOrdinal(year, month, day) {
      return day + (isLeapYear(year) ? leapLadder : nonLeapLadder)[month - 1];
    }

    function uncomputeOrdinal(year, ordinal) {
      const table = isLeapYear(year) ? leapLadder : nonLeapLadder,
        month0 = table.findIndex(i => i < ordinal),
        day = ordinal - table[month0];
      return { month: month0 + 1, day };
    }

    /**
     * @private
     */

    function gregorianToWeek(gregObj) {
      const { year, month, day } = gregObj,
        ordinal = computeOrdinal(year, month, day),
        weekday = dayOfWeek(year, month, day);

      let weekNumber = Math.floor((ordinal - weekday + 10) / 7),
        weekYear;

      if (weekNumber < 1) {
        weekYear = year - 1;
        weekNumber = weeksInWeekYear(weekYear);
      } else if (weekNumber > weeksInWeekYear(year)) {
        weekYear = year + 1;
        weekNumber = 1;
      } else {
        weekYear = year;
      }

      return Object.assign({ weekYear, weekNumber, weekday }, timeObject(gregObj));
    }

    function weekToGregorian(weekData) {
      const { weekYear, weekNumber, weekday } = weekData,
        weekdayOfJan4 = dayOfWeek(weekYear, 1, 4),
        yearInDays = daysInYear(weekYear);

      let ordinal = weekNumber * 7 + weekday - weekdayOfJan4 - 3,
        year;

      if (ordinal < 1) {
        year = weekYear - 1;
        ordinal += daysInYear(year);
      } else if (ordinal > yearInDays) {
        year = weekYear + 1;
        ordinal -= daysInYear(weekYear);
      } else {
        year = weekYear;
      }

      const { month, day } = uncomputeOrdinal(year, ordinal);

      return Object.assign({ year, month, day }, timeObject(weekData));
    }

    function gregorianToOrdinal(gregData) {
      const { year, month, day } = gregData,
        ordinal = computeOrdinal(year, month, day);

      return Object.assign({ year, ordinal }, timeObject(gregData));
    }

    function ordinalToGregorian(ordinalData) {
      const { year, ordinal } = ordinalData,
        { month, day } = uncomputeOrdinal(year, ordinal);

      return Object.assign({ year, month, day }, timeObject(ordinalData));
    }

    function hasInvalidWeekData(obj) {
      const validYear = isInteger(obj.weekYear),
        validWeek = integerBetween(obj.weekNumber, 1, weeksInWeekYear(obj.weekYear)),
        validWeekday = integerBetween(obj.weekday, 1, 7);

      if (!validYear) {
        return unitOutOfRange("weekYear", obj.weekYear);
      } else if (!validWeek) {
        return unitOutOfRange("week", obj.week);
      } else if (!validWeekday) {
        return unitOutOfRange("weekday", obj.weekday);
      } else return false;
    }

    function hasInvalidOrdinalData(obj) {
      const validYear = isInteger(obj.year),
        validOrdinal = integerBetween(obj.ordinal, 1, daysInYear(obj.year));

      if (!validYear) {
        return unitOutOfRange("year", obj.year);
      } else if (!validOrdinal) {
        return unitOutOfRange("ordinal", obj.ordinal);
      } else return false;
    }

    function hasInvalidGregorianData(obj) {
      const validYear = isInteger(obj.year),
        validMonth = integerBetween(obj.month, 1, 12),
        validDay = integerBetween(obj.day, 1, daysInMonth(obj.year, obj.month));

      if (!validYear) {
        return unitOutOfRange("year", obj.year);
      } else if (!validMonth) {
        return unitOutOfRange("month", obj.month);
      } else if (!validDay) {
        return unitOutOfRange("day", obj.day);
      } else return false;
    }

    function hasInvalidTimeData(obj) {
      const { hour, minute, second, millisecond } = obj;
      const validHour =
          integerBetween(hour, 0, 23) ||
          (hour === 24 && minute === 0 && second === 0 && millisecond === 0),
        validMinute = integerBetween(minute, 0, 59),
        validSecond = integerBetween(second, 0, 59),
        validMillisecond = integerBetween(millisecond, 0, 999);

      if (!validHour) {
        return unitOutOfRange("hour", hour);
      } else if (!validMinute) {
        return unitOutOfRange("minute", minute);
      } else if (!validSecond) {
        return unitOutOfRange("second", second);
      } else if (!validMillisecond) {
        return unitOutOfRange("millisecond", millisecond);
      } else return false;
    }

    const INVALID$2 = "Invalid DateTime";
    const MAX_DATE = 8.64e15;

    function unsupportedZone(zone) {
      return new Invalid("unsupported zone", `the zone "${zone.name}" is not supported`);
    }

    // we cache week data on the DT object and this intermediates the cache
    function possiblyCachedWeekData(dt) {
      if (dt.weekData === null) {
        dt.weekData = gregorianToWeek(dt.c);
      }
      return dt.weekData;
    }

    // clone really means, "make a new object with these modifications". all "setters" really use this
    // to create a new object while only changing some of the properties
    function clone$1(inst, alts) {
      const current = {
        ts: inst.ts,
        zone: inst.zone,
        c: inst.c,
        o: inst.o,
        loc: inst.loc,
        invalid: inst.invalid
      };
      return new DateTime(Object.assign({}, current, alts, { old: current }));
    }

    // find the right offset a given local time. The o input is our guess, which determines which
    // offset we'll pick in ambiguous cases (e.g. there are two 3 AMs b/c Fallback DST)
    function fixOffset(localTS, o, tz) {
      // Our UTC time is just a guess because our offset is just a guess
      let utcGuess = localTS - o * 60 * 1000;

      // Test whether the zone matches the offset for this ts
      const o2 = tz.offset(utcGuess);

      // If so, offset didn't change and we're done
      if (o === o2) {
        return [utcGuess, o];
      }

      // If not, change the ts by the difference in the offset
      utcGuess -= (o2 - o) * 60 * 1000;

      // If that gives us the local time we want, we're done
      const o3 = tz.offset(utcGuess);
      if (o2 === o3) {
        return [utcGuess, o2];
      }

      // If it's different, we're in a hole time. The offset has changed, but the we don't adjust the time
      return [localTS - Math.min(o2, o3) * 60 * 1000, Math.max(o2, o3)];
    }

    // convert an epoch timestamp into a calendar object with the given offset
    function tsToObj(ts, offset) {
      ts += offset * 60 * 1000;

      const d = new Date(ts);

      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
        second: d.getUTCSeconds(),
        millisecond: d.getUTCMilliseconds()
      };
    }

    // convert a calendar object to a epoch timestamp
    function objToTS(obj, offset, zone) {
      return fixOffset(objToLocalTS(obj), offset, zone);
    }

    // create a new DT instance by adding a duration, adjusting for DSTs
    function adjustTime(inst, dur) {
      const oPre = inst.o,
        year = inst.c.year + Math.trunc(dur.years),
        month = inst.c.month + Math.trunc(dur.months) + Math.trunc(dur.quarters) * 3,
        c = Object.assign({}, inst.c, {
          year,
          month,
          day:
            Math.min(inst.c.day, daysInMonth(year, month)) +
            Math.trunc(dur.days) +
            Math.trunc(dur.weeks) * 7
        }),
        millisToAdd = Duration.fromObject({
          years: dur.years - Math.trunc(dur.years),
          quarters: dur.quarters - Math.trunc(dur.quarters),
          months: dur.months - Math.trunc(dur.months),
          weeks: dur.weeks - Math.trunc(dur.weeks),
          days: dur.days - Math.trunc(dur.days),
          hours: dur.hours,
          minutes: dur.minutes,
          seconds: dur.seconds,
          milliseconds: dur.milliseconds
        }).as("milliseconds"),
        localTS = objToLocalTS(c);

      let [ts, o] = fixOffset(localTS, oPre, inst.zone);

      if (millisToAdd !== 0) {
        ts += millisToAdd;
        // that could have changed the offset by going over a DST, but we want to keep the ts the same
        o = inst.zone.offset(ts);
      }

      return { ts, o };
    }

    // helper useful in turning the results of parsing into real dates
    // by handling the zone options
    function parseDataToDateTime(parsed, parsedZone, opts, format, text) {
      const { setZone, zone } = opts;
      if (parsed && Object.keys(parsed).length !== 0) {
        const interpretationZone = parsedZone || zone,
          inst = DateTime.fromObject(
            Object.assign(parsed, opts, {
              zone: interpretationZone,
              // setZone is a valid option in the calling methods, but not in fromObject
              setZone: undefined
            })
          );
        return setZone ? inst : inst.setZone(zone);
      } else {
        return DateTime.invalid(
          new Invalid("unparsable", `the input "${text}" can't be parsed as ${format}`)
        );
      }
    }

    // if you want to output a technical format (e.g. RFC 2822), this helper
    // helps handle the details
    function toTechFormat(dt, format, allowZ = true) {
      return dt.isValid
        ? Formatter.create(Locale.create("en-US"), {
            allowZ,
            forceSimple: true
          }).formatDateTimeFromString(dt, format)
        : null;
    }

    // technical time formats (e.g. the time part of ISO 8601), take some options
    // and this commonizes their handling
    function toTechTimeFormat(
      dt,
      {
        suppressSeconds = false,
        suppressMilliseconds = false,
        includeOffset,
        includePrefix = false,
        includeZone = false,
        spaceZone = false,
        format = "extended"
      }
    ) {
      let fmt = format === "basic" ? "HHmm" : "HH:mm";

      if (!suppressSeconds || dt.second !== 0 || dt.millisecond !== 0) {
        fmt += format === "basic" ? "ss" : ":ss";
        if (!suppressMilliseconds || dt.millisecond !== 0) {
          fmt += ".SSS";
        }
      }

      if ((includeZone || includeOffset) && spaceZone) {
        fmt += " ";
      }

      if (includeZone) {
        fmt += "z";
      } else if (includeOffset) {
        fmt += format === "basic" ? "ZZZ" : "ZZ";
      }

      let str = toTechFormat(dt, fmt);

      if (includePrefix) {
        str = "T" + str;
      }

      return str;
    }

    // defaults for unspecified units in the supported calendars
    const defaultUnitValues = {
        month: 1,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0
      },
      defaultWeekUnitValues = {
        weekNumber: 1,
        weekday: 1,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0
      },
      defaultOrdinalUnitValues = {
        ordinal: 1,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0
      };

    // Units in the supported calendars, sorted by bigness
    const orderedUnits$1 = ["year", "month", "day", "hour", "minute", "second", "millisecond"],
      orderedWeekUnits = [
        "weekYear",
        "weekNumber",
        "weekday",
        "hour",
        "minute",
        "second",
        "millisecond"
      ],
      orderedOrdinalUnits = ["year", "ordinal", "hour", "minute", "second", "millisecond"];

    // standardize case and plurality in units
    function normalizeUnit(unit) {
      const normalized = {
        year: "year",
        years: "year",
        month: "month",
        months: "month",
        day: "day",
        days: "day",
        hour: "hour",
        hours: "hour",
        minute: "minute",
        minutes: "minute",
        quarter: "quarter",
        quarters: "quarter",
        second: "second",
        seconds: "second",
        millisecond: "millisecond",
        milliseconds: "millisecond",
        weekday: "weekday",
        weekdays: "weekday",
        weeknumber: "weekNumber",
        weeksnumber: "weekNumber",
        weeknumbers: "weekNumber",
        weekyear: "weekYear",
        weekyears: "weekYear",
        ordinal: "ordinal"
      }[unit.toLowerCase()];

      if (!normalized) throw new InvalidUnitError(unit);

      return normalized;
    }

    // this is a dumbed down version of fromObject() that runs about 60% faster
    // but doesn't do any validation, makes a bunch of assumptions about what units
    // are present, and so on.
    function quickDT(obj, zone) {
      // assume we have the higher-order units
      for (const u of orderedUnits$1) {
        if (isUndefined(obj[u])) {
          obj[u] = defaultUnitValues[u];
        }
      }

      const invalid = hasInvalidGregorianData(obj) || hasInvalidTimeData(obj);
      if (invalid) {
        return DateTime.invalid(invalid);
      }

      const tsNow = Settings.now(),
        offsetProvis = zone.offset(tsNow),
        [ts, o] = objToTS(obj, offsetProvis, zone);

      return new DateTime({
        ts,
        zone,
        o
      });
    }

    function diffRelative(start, end, opts) {
      const round = isUndefined(opts.round) ? true : opts.round,
        format = (c, unit) => {
          c = roundTo(c, round || opts.calendary ? 0 : 2, true);
          const formatter = end.loc.clone(opts).relFormatter(opts);
          return formatter.format(c, unit);
        },
        differ = unit => {
          if (opts.calendary) {
            if (!end.hasSame(start, unit)) {
              return end
                .startOf(unit)
                .diff(start.startOf(unit), unit)
                .get(unit);
            } else return 0;
          } else {
            return end.diff(start, unit).get(unit);
          }
        };

      if (opts.unit) {
        return format(differ(opts.unit), opts.unit);
      }

      for (const unit of opts.units) {
        const count = differ(unit);
        if (Math.abs(count) >= 1) {
          return format(count, unit);
        }
      }
      return format(0, opts.units[opts.units.length - 1]);
    }

    /**
     * A DateTime is an immutable data structure representing a specific date and time and accompanying methods. It contains class and instance methods for creating, parsing, interrogating, transforming, and formatting them.
     *
     * A DateTime comprises of:
     * * A timestamp. Each DateTime instance refers to a specific millisecond of the Unix epoch.
     * * A time zone. Each instance is considered in the context of a specific zone (by default the local system's zone).
     * * Configuration properties that effect how output strings are formatted, such as `locale`, `numberingSystem`, and `outputCalendar`.
     *
     * Here is a brief overview of the most commonly used functionality it provides:
     *
     * * **Creation**: To create a DateTime from its components, use one of its factory class methods: {@link local}, {@link utc}, and (most flexibly) {@link fromObject}. To create one from a standard string format, use {@link fromISO}, {@link fromHTTP}, and {@link fromRFC2822}. To create one from a custom string format, use {@link fromFormat}. To create one from a native JS date, use {@link fromJSDate}.
     * * **Gregorian calendar and time**: To examine the Gregorian properties of a DateTime individually (i.e as opposed to collectively through {@link toObject}), use the {@link year}, {@link month},
     * {@link day}, {@link hour}, {@link minute}, {@link second}, {@link millisecond} accessors.
     * * **Week calendar**: For ISO week calendar attributes, see the {@link weekYear}, {@link weekNumber}, and {@link weekday} accessors.
     * * **Configuration** See the {@link locale} and {@link numberingSystem} accessors.
     * * **Transformation**: To transform the DateTime into other DateTimes, use {@link set}, {@link reconfigure}, {@link setZone}, {@link setLocale}, {@link plus}, {@link minus}, {@link endOf}, {@link startOf}, {@link toUTC}, and {@link toLocal}.
     * * **Output**: To convert the DateTime to other representations, use the {@link toRelative}, {@link toRelativeCalendar}, {@link toJSON}, {@link toISO}, {@link toHTTP}, {@link toObject}, {@link toRFC2822}, {@link toString}, {@link toLocaleString}, {@link toFormat}, {@link toMillis} and {@link toJSDate}.
     *
     * There's plenty others documented below. In addition, for more information on subtler topics like internationalization, time zones, alternative calendars, validity, and so on, see the external documentation.
     */
    class DateTime {
      /**
       * @access private
       */
      constructor(config) {
        const zone = config.zone || Settings.defaultZone;

        let invalid =
          config.invalid ||
          (Number.isNaN(config.ts) ? new Invalid("invalid input") : null) ||
          (!zone.isValid ? unsupportedZone(zone) : null);
        /**
         * @access private
         */
        this.ts = isUndefined(config.ts) ? Settings.now() : config.ts;

        let c = null,
          o = null;
        if (!invalid) {
          const unchanged = config.old && config.old.ts === this.ts && config.old.zone.equals(zone);

          if (unchanged) {
            [c, o] = [config.old.c, config.old.o];
          } else {
            const ot = zone.offset(this.ts);
            c = tsToObj(this.ts, ot);
            invalid = Number.isNaN(c.year) ? new Invalid("invalid input") : null;
            c = invalid ? null : c;
            o = invalid ? null : ot;
          }
        }

        /**
         * @access private
         */
        this._zone = zone;
        /**
         * @access private
         */
        this.loc = config.loc || Locale.create();
        /**
         * @access private
         */
        this.invalid = invalid;
        /**
         * @access private
         */
        this.weekData = null;
        /**
         * @access private
         */
        this.c = c;
        /**
         * @access private
         */
        this.o = o;
        /**
         * @access private
         */
        this.isLuxonDateTime = true;
      }

      // CONSTRUCT

      /**
       * Create a DateTime for the current instant, in the system's time zone.
       *
       * Use Settings to override these default values if needed.
       * @example DateTime.now().toISO() //~> now in the ISO format
       * @return {DateTime}
       */
      static now() {
        return new DateTime({});
      }

      /**
       * Create a local DateTime
       * @param {number} [year] - The calendar year. If omitted (as in, call `local()` with no arguments), the current time will be used
       * @param {number} [month=1] - The month, 1-indexed
       * @param {number} [day=1] - The day of the month, 1-indexed
       * @param {number} [hour=0] - The hour of the day, in 24-hour time
       * @param {number} [minute=0] - The minute of the hour, meaning a number between 0 and 59
       * @param {number} [second=0] - The second of the minute, meaning a number between 0 and 59
       * @param {number} [millisecond=0] - The millisecond of the second, meaning a number between 0 and 999
       * @example DateTime.local()                            //~> now
       * @example DateTime.local(2017)                        //~> 2017-01-01T00:00:00
       * @example DateTime.local(2017, 3)                     //~> 2017-03-01T00:00:00
       * @example DateTime.local(2017, 3, 12)                 //~> 2017-03-12T00:00:00
       * @example DateTime.local(2017, 3, 12, 5)              //~> 2017-03-12T05:00:00
       * @example DateTime.local(2017, 3, 12, 5, 45)          //~> 2017-03-12T05:45:00
       * @example DateTime.local(2017, 3, 12, 5, 45, 10)      //~> 2017-03-12T05:45:10
       * @example DateTime.local(2017, 3, 12, 5, 45, 10, 765) //~> 2017-03-12T05:45:10.765
       * @return {DateTime}
       */
      static local(year, month, day, hour, minute, second, millisecond) {
        if (isUndefined(year)) {
          return new DateTime({});
        } else {
          return quickDT(
            {
              year,
              month,
              day,
              hour,
              minute,
              second,
              millisecond
            },
            Settings.defaultZone
          );
        }
      }

      /**
       * Create a DateTime in UTC
       * @param {number} [year] - The calendar year. If omitted (as in, call `utc()` with no arguments), the current time will be used
       * @param {number} [month=1] - The month, 1-indexed
       * @param {number} [day=1] - The day of the month
       * @param {number} [hour=0] - The hour of the day, in 24-hour time
       * @param {number} [minute=0] - The minute of the hour, meaning a number between 0 and 59
       * @param {number} [second=0] - The second of the minute, meaning a number between 0 and 59
       * @param {number} [millisecond=0] - The millisecond of the second, meaning a number between 0 and 999
       * @example DateTime.utc()                            //~> now
       * @example DateTime.utc(2017)                        //~> 2017-01-01T00:00:00Z
       * @example DateTime.utc(2017, 3)                     //~> 2017-03-01T00:00:00Z
       * @example DateTime.utc(2017, 3, 12)                 //~> 2017-03-12T00:00:00Z
       * @example DateTime.utc(2017, 3, 12, 5)              //~> 2017-03-12T05:00:00Z
       * @example DateTime.utc(2017, 3, 12, 5, 45)          //~> 2017-03-12T05:45:00Z
       * @example DateTime.utc(2017, 3, 12, 5, 45, 10)      //~> 2017-03-12T05:45:10Z
       * @example DateTime.utc(2017, 3, 12, 5, 45, 10, 765) //~> 2017-03-12T05:45:10.765Z
       * @return {DateTime}
       */
      static utc(year, month, day, hour, minute, second, millisecond) {
        if (isUndefined(year)) {
          return new DateTime({
            ts: Settings.now(),
            zone: FixedOffsetZone.utcInstance
          });
        } else {
          return quickDT(
            {
              year,
              month,
              day,
              hour,
              minute,
              second,
              millisecond
            },
            FixedOffsetZone.utcInstance
          );
        }
      }

      /**
       * Create a DateTime from a JavaScript Date object. Uses the default zone.
       * @param {Date} date - a JavaScript Date object
       * @param {Object} options - configuration options for the DateTime
       * @param {string|Zone} [options.zone='local'] - the zone to place the DateTime into
       * @return {DateTime}
       */
      static fromJSDate(date, options = {}) {
        const ts = isDate(date) ? date.valueOf() : NaN;
        if (Number.isNaN(ts)) {
          return DateTime.invalid("invalid input");
        }

        const zoneToUse = normalizeZone(options.zone, Settings.defaultZone);
        if (!zoneToUse.isValid) {
          return DateTime.invalid(unsupportedZone(zoneToUse));
        }

        return new DateTime({
          ts: ts,
          zone: zoneToUse,
          loc: Locale.fromObject(options)
        });
      }

      /**
       * Create a DateTime from a number of milliseconds since the epoch (meaning since 1 January 1970 00:00:00 UTC). Uses the default zone.
       * @param {number} milliseconds - a number of milliseconds since 1970 UTC
       * @param {Object} options - configuration options for the DateTime
       * @param {string|Zone} [options.zone='local'] - the zone to place the DateTime into
       * @param {string} [options.locale] - a locale to set on the resulting DateTime instance
       * @param {string} options.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @param {string} options.numberingSystem - the numbering system to set on the resulting DateTime instance
       * @return {DateTime}
       */
      static fromMillis(milliseconds, options = {}) {
        if (!isNumber(milliseconds)) {
          throw new InvalidArgumentError(
            `fromMillis requires a numerical input, but received a ${typeof milliseconds} with value ${milliseconds}`
          );
        } else if (milliseconds < -MAX_DATE || milliseconds > MAX_DATE) {
          // this isn't perfect because because we can still end up out of range because of additional shifting, but it's a start
          return DateTime.invalid("Timestamp out of range");
        } else {
          return new DateTime({
            ts: milliseconds,
            zone: normalizeZone(options.zone, Settings.defaultZone),
            loc: Locale.fromObject(options)
          });
        }
      }

      /**
       * Create a DateTime from a number of seconds since the epoch (meaning since 1 January 1970 00:00:00 UTC). Uses the default zone.
       * @param {number} seconds - a number of seconds since 1970 UTC
       * @param {Object} options - configuration options for the DateTime
       * @param {string|Zone} [options.zone='local'] - the zone to place the DateTime into
       * @param {string} [options.locale] - a locale to set on the resulting DateTime instance
       * @param {string} options.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @param {string} options.numberingSystem - the numbering system to set on the resulting DateTime instance
       * @return {DateTime}
       */
      static fromSeconds(seconds, options = {}) {
        if (!isNumber(seconds)) {
          throw new InvalidArgumentError("fromSeconds requires a numerical input");
        } else {
          return new DateTime({
            ts: seconds * 1000,
            zone: normalizeZone(options.zone, Settings.defaultZone),
            loc: Locale.fromObject(options)
          });
        }
      }

      /**
       * Create a DateTime from a JavaScript object with keys like 'year' and 'hour' with reasonable defaults.
       * @param {Object} obj - the object to create the DateTime from
       * @param {number} obj.year - a year, such as 1987
       * @param {number} obj.month - a month, 1-12
       * @param {number} obj.day - a day of the month, 1-31, depending on the month
       * @param {number} obj.ordinal - day of the year, 1-365 or 366
       * @param {number} obj.weekYear - an ISO week year
       * @param {number} obj.weekNumber - an ISO week number, between 1 and 52 or 53, depending on the year
       * @param {number} obj.weekday - an ISO weekday, 1-7, where 1 is Monday and 7 is Sunday
       * @param {number} obj.hour - hour of the day, 0-23
       * @param {number} obj.minute - minute of the hour, 0-59
       * @param {number} obj.second - second of the minute, 0-59
       * @param {number} obj.millisecond - millisecond of the second, 0-999
       * @param {string|Zone} [obj.zone='local'] - interpret the numbers in the context of a particular zone. Can take any value taken as the first argument to setZone()
       * @param {string} [obj.locale='system's locale'] - a locale to set on the resulting DateTime instance
       * @param {string} obj.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @param {string} obj.numberingSystem - the numbering system to set on the resulting DateTime instance
       * @example DateTime.fromObject({ year: 1982, month: 5, day: 25}).toISODate() //=> '1982-05-25'
       * @example DateTime.fromObject({ year: 1982 }).toISODate() //=> '1982-01-01'
       * @example DateTime.fromObject({ hour: 10, minute: 26, second: 6 }) //~> today at 10:26:06
       * @example DateTime.fromObject({ hour: 10, minute: 26, second: 6, zone: 'utc' }),
       * @example DateTime.fromObject({ hour: 10, minute: 26, second: 6, zone: 'local' })
       * @example DateTime.fromObject({ hour: 10, minute: 26, second: 6, zone: 'America/New_York' })
       * @example DateTime.fromObject({ weekYear: 2016, weekNumber: 2, weekday: 3 }).toISODate() //=> '2016-01-13'
       * @return {DateTime}
       */
      static fromObject(obj) {
        const zoneToUse = normalizeZone(obj.zone, Settings.defaultZone);
        if (!zoneToUse.isValid) {
          return DateTime.invalid(unsupportedZone(zoneToUse));
        }

        const tsNow = Settings.now(),
          offsetProvis = zoneToUse.offset(tsNow),
          normalized = normalizeObject(obj, normalizeUnit, [
            "zone",
            "locale",
            "outputCalendar",
            "numberingSystem"
          ]),
          containsOrdinal = !isUndefined(normalized.ordinal),
          containsGregorYear = !isUndefined(normalized.year),
          containsGregorMD = !isUndefined(normalized.month) || !isUndefined(normalized.day),
          containsGregor = containsGregorYear || containsGregorMD,
          definiteWeekDef = normalized.weekYear || normalized.weekNumber,
          loc = Locale.fromObject(obj);

        // cases:
        // just a weekday -> this week's instance of that weekday, no worries
        // (gregorian data or ordinal) + (weekYear or weekNumber) -> error
        // (gregorian month or day) + ordinal -> error
        // otherwise just use weeks or ordinals or gregorian, depending on what's specified

        if ((containsGregor || containsOrdinal) && definiteWeekDef) {
          throw new ConflictingSpecificationError(
            "Can't mix weekYear/weekNumber units with year/month/day or ordinals"
          );
        }

        if (containsGregorMD && containsOrdinal) {
          throw new ConflictingSpecificationError("Can't mix ordinal dates with month/day");
        }

        const useWeekData = definiteWeekDef || (normalized.weekday && !containsGregor);

        // configure ourselves to deal with gregorian dates or week stuff
        let units,
          defaultValues,
          objNow = tsToObj(tsNow, offsetProvis);
        if (useWeekData) {
          units = orderedWeekUnits;
          defaultValues = defaultWeekUnitValues;
          objNow = gregorianToWeek(objNow);
        } else if (containsOrdinal) {
          units = orderedOrdinalUnits;
          defaultValues = defaultOrdinalUnitValues;
          objNow = gregorianToOrdinal(objNow);
        } else {
          units = orderedUnits$1;
          defaultValues = defaultUnitValues;
        }

        // set default values for missing stuff
        let foundFirst = false;
        for (const u of units) {
          const v = normalized[u];
          if (!isUndefined(v)) {
            foundFirst = true;
          } else if (foundFirst) {
            normalized[u] = defaultValues[u];
          } else {
            normalized[u] = objNow[u];
          }
        }

        // make sure the values we have are in range
        const higherOrderInvalid = useWeekData
            ? hasInvalidWeekData(normalized)
            : containsOrdinal
              ? hasInvalidOrdinalData(normalized)
              : hasInvalidGregorianData(normalized),
          invalid = higherOrderInvalid || hasInvalidTimeData(normalized);

        if (invalid) {
          return DateTime.invalid(invalid);
        }

        // compute the actual time
        const gregorian = useWeekData
            ? weekToGregorian(normalized)
            : containsOrdinal
              ? ordinalToGregorian(normalized)
              : normalized,
          [tsFinal, offsetFinal] = objToTS(gregorian, offsetProvis, zoneToUse),
          inst = new DateTime({
            ts: tsFinal,
            zone: zoneToUse,
            o: offsetFinal,
            loc
          });

        // gregorian data + weekday serves only to validate
        if (normalized.weekday && containsGregor && obj.weekday !== inst.weekday) {
          return DateTime.invalid(
            "mismatched weekday",
            `you can't specify both a weekday of ${normalized.weekday} and a date of ${inst.toISO()}`
          );
        }

        return inst;
      }

      /**
       * Create a DateTime from an ISO 8601 string
       * @param {string} text - the ISO string
       * @param {Object} opts - options to affect the creation
       * @param {string|Zone} [opts.zone='local'] - use this zone if no offset is specified in the input string itself. Will also convert the time to this zone
       * @param {boolean} [opts.setZone=false] - override the zone with a fixed-offset zone specified in the string itself, if it specifies one
       * @param {string} [opts.locale='system's locale'] - a locale to set on the resulting DateTime instance
       * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @param {string} opts.numberingSystem - the numbering system to set on the resulting DateTime instance
       * @example DateTime.fromISO('2016-05-25T09:08:34.123')
       * @example DateTime.fromISO('2016-05-25T09:08:34.123+06:00')
       * @example DateTime.fromISO('2016-05-25T09:08:34.123+06:00', {setZone: true})
       * @example DateTime.fromISO('2016-05-25T09:08:34.123', {zone: 'utc'})
       * @example DateTime.fromISO('2016-W05-4')
       * @return {DateTime}
       */
      static fromISO(text, opts = {}) {
        const [vals, parsedZone] = parseISODate(text);
        return parseDataToDateTime(vals, parsedZone, opts, "ISO 8601", text);
      }

      /**
       * Create a DateTime from an RFC 2822 string
       * @param {string} text - the RFC 2822 string
       * @param {Object} opts - options to affect the creation
       * @param {string|Zone} [opts.zone='local'] - convert the time to this zone. Since the offset is always specified in the string itself, this has no effect on the interpretation of string, merely the zone the resulting DateTime is expressed in.
       * @param {boolean} [opts.setZone=false] - override the zone with a fixed-offset zone specified in the string itself, if it specifies one
       * @param {string} [opts.locale='system's locale'] - a locale to set on the resulting DateTime instance
       * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @param {string} opts.numberingSystem - the numbering system to set on the resulting DateTime instance
       * @example DateTime.fromRFC2822('25 Nov 2016 13:23:12 GMT')
       * @example DateTime.fromRFC2822('Fri, 25 Nov 2016 13:23:12 +0600')
       * @example DateTime.fromRFC2822('25 Nov 2016 13:23 Z')
       * @return {DateTime}
       */
      static fromRFC2822(text, opts = {}) {
        const [vals, parsedZone] = parseRFC2822Date(text);
        return parseDataToDateTime(vals, parsedZone, opts, "RFC 2822", text);
      }

      /**
       * Create a DateTime from an HTTP header date
       * @see https://www.w3.org/Protocols/rfc2616/rfc2616-sec3.html#sec3.3.1
       * @param {string} text - the HTTP header date
       * @param {Object} opts - options to affect the creation
       * @param {string|Zone} [opts.zone='local'] - convert the time to this zone. Since HTTP dates are always in UTC, this has no effect on the interpretation of string, merely the zone the resulting DateTime is expressed in.
       * @param {boolean} [opts.setZone=false] - override the zone with the fixed-offset zone specified in the string. For HTTP dates, this is always UTC, so this option is equivalent to setting the `zone` option to 'utc', but this option is included for consistency with similar methods.
       * @param {string} [opts.locale='system's locale'] - a locale to set on the resulting DateTime instance
       * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @param {string} opts.numberingSystem - the numbering system to set on the resulting DateTime instance
       * @example DateTime.fromHTTP('Sun, 06 Nov 1994 08:49:37 GMT')
       * @example DateTime.fromHTTP('Sunday, 06-Nov-94 08:49:37 GMT')
       * @example DateTime.fromHTTP('Sun Nov  6 08:49:37 1994')
       * @return {DateTime}
       */
      static fromHTTP(text, opts = {}) {
        const [vals, parsedZone] = parseHTTPDate(text);
        return parseDataToDateTime(vals, parsedZone, opts, "HTTP", opts);
      }

      /**
       * Create a DateTime from an input string and format string.
       * Defaults to en-US if no locale has been specified, regardless of the system's locale.
       * @see https://moment.github.io/luxon/docs/manual/parsing.html#table-of-tokens
       * @param {string} text - the string to parse
       * @param {string} fmt - the format the string is expected to be in (see the link below for the formats)
       * @param {Object} opts - options to affect the creation
       * @param {string|Zone} [opts.zone='local'] - use this zone if no offset is specified in the input string itself. Will also convert the DateTime to this zone
       * @param {boolean} [opts.setZone=false] - override the zone with a zone specified in the string itself, if it specifies one
       * @param {string} [opts.locale='en-US'] - a locale string to use when parsing. Will also set the DateTime to this locale
       * @param {string} opts.numberingSystem - the numbering system to use when parsing. Will also set the resulting DateTime to this numbering system
       * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @return {DateTime}
       */
      static fromFormat(text, fmt, opts = {}) {
        if (isUndefined(text) || isUndefined(fmt)) {
          throw new InvalidArgumentError("fromFormat requires an input string and a format");
        }

        const { locale = null, numberingSystem = null } = opts,
          localeToUse = Locale.fromOpts({
            locale,
            numberingSystem,
            defaultToEN: true
          }),
          [vals, parsedZone, invalid] = parseFromTokens(localeToUse, text, fmt);
        if (invalid) {
          return DateTime.invalid(invalid);
        } else {
          return parseDataToDateTime(vals, parsedZone, opts, `format ${fmt}`, text);
        }
      }

      /**
       * @deprecated use fromFormat instead
       */
      static fromString(text, fmt, opts = {}) {
        return DateTime.fromFormat(text, fmt, opts);
      }

      /**
       * Create a DateTime from a SQL date, time, or datetime
       * Defaults to en-US if no locale has been specified, regardless of the system's locale
       * @param {string} text - the string to parse
       * @param {Object} opts - options to affect the creation
       * @param {string|Zone} [opts.zone='local'] - use this zone if no offset is specified in the input string itself. Will also convert the DateTime to this zone
       * @param {boolean} [opts.setZone=false] - override the zone with a zone specified in the string itself, if it specifies one
       * @param {string} [opts.locale='en-US'] - a locale string to use when parsing. Will also set the DateTime to this locale
       * @param {string} opts.numberingSystem - the numbering system to use when parsing. Will also set the resulting DateTime to this numbering system
       * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @example DateTime.fromSQL('2017-05-15')
       * @example DateTime.fromSQL('2017-05-15 09:12:34')
       * @example DateTime.fromSQL('2017-05-15 09:12:34.342')
       * @example DateTime.fromSQL('2017-05-15 09:12:34.342+06:00')
       * @example DateTime.fromSQL('2017-05-15 09:12:34.342 America/Los_Angeles')
       * @example DateTime.fromSQL('2017-05-15 09:12:34.342 America/Los_Angeles', { setZone: true })
       * @example DateTime.fromSQL('2017-05-15 09:12:34.342', { zone: 'America/Los_Angeles' })
       * @example DateTime.fromSQL('09:12:34.342')
       * @return {DateTime}
       */
      static fromSQL(text, opts = {}) {
        const [vals, parsedZone] = parseSQL(text);
        return parseDataToDateTime(vals, parsedZone, opts, "SQL", text);
      }

      /**
       * Create an invalid DateTime.
       * @param {string} reason - simple string of why this DateTime is invalid. Should not contain parameters or anything else data-dependent
       * @param {string} [explanation=null] - longer explanation, may include parameters and other useful debugging information
       * @return {DateTime}
       */
      static invalid(reason, explanation = null) {
        if (!reason) {
          throw new InvalidArgumentError("need to specify a reason the DateTime is invalid");
        }

        const invalid = reason instanceof Invalid ? reason : new Invalid(reason, explanation);

        if (Settings.throwOnInvalid) {
          throw new InvalidDateTimeError(invalid);
        } else {
          return new DateTime({ invalid });
        }
      }

      /**
       * Check if an object is a DateTime. Works across context boundaries
       * @param {object} o
       * @return {boolean}
       */
      static isDateTime(o) {
        return (o && o.isLuxonDateTime) || false;
      }

      // INFO

      /**
       * Get the value of unit.
       * @param {string} unit - a unit such as 'minute' or 'day'
       * @example DateTime.local(2017, 7, 4).get('month'); //=> 7
       * @example DateTime.local(2017, 7, 4).get('day'); //=> 4
       * @return {number}
       */
      get(unit) {
        return this[unit];
      }

      /**
       * Returns whether the DateTime is valid. Invalid DateTimes occur when:
       * * The DateTime was created from invalid calendar information, such as the 13th month or February 30
       * * The DateTime was created by an operation on another invalid date
       * @type {boolean}
       */
      get isValid() {
        return this.invalid === null;
      }

      /**
       * Returns an error code if this DateTime is invalid, or null if the DateTime is valid
       * @type {string}
       */
      get invalidReason() {
        return this.invalid ? this.invalid.reason : null;
      }

      /**
       * Returns an explanation of why this DateTime became invalid, or null if the DateTime is valid
       * @type {string}
       */
      get invalidExplanation() {
        return this.invalid ? this.invalid.explanation : null;
      }

      /**
       * Get the locale of a DateTime, such 'en-GB'. The locale is used when formatting the DateTime
       *
       * @type {string}
       */
      get locale() {
        return this.isValid ? this.loc.locale : null;
      }

      /**
       * Get the numbering system of a DateTime, such 'beng'. The numbering system is used when formatting the DateTime
       *
       * @type {string}
       */
      get numberingSystem() {
        return this.isValid ? this.loc.numberingSystem : null;
      }

      /**
       * Get the output calendar of a DateTime, such 'islamic'. The output calendar is used when formatting the DateTime
       *
       * @type {string}
       */
      get outputCalendar() {
        return this.isValid ? this.loc.outputCalendar : null;
      }

      /**
       * Get the time zone associated with this DateTime.
       * @type {Zone}
       */
      get zone() {
        return this._zone;
      }

      /**
       * Get the name of the time zone.
       * @type {string}
       */
      get zoneName() {
        return this.isValid ? this.zone.name : null;
      }

      /**
       * Get the year
       * @example DateTime.local(2017, 5, 25).year //=> 2017
       * @type {number}
       */
      get year() {
        return this.isValid ? this.c.year : NaN;
      }

      /**
       * Get the quarter
       * @example DateTime.local(2017, 5, 25).quarter //=> 2
       * @type {number}
       */
      get quarter() {
        return this.isValid ? Math.ceil(this.c.month / 3) : NaN;
      }

      /**
       * Get the month (1-12).
       * @example DateTime.local(2017, 5, 25).month //=> 5
       * @type {number}
       */
      get month() {
        return this.isValid ? this.c.month : NaN;
      }

      /**
       * Get the day of the month (1-30ish).
       * @example DateTime.local(2017, 5, 25).day //=> 25
       * @type {number}
       */
      get day() {
        return this.isValid ? this.c.day : NaN;
      }

      /**
       * Get the hour of the day (0-23).
       * @example DateTime.local(2017, 5, 25, 9).hour //=> 9
       * @type {number}
       */
      get hour() {
        return this.isValid ? this.c.hour : NaN;
      }

      /**
       * Get the minute of the hour (0-59).
       * @example DateTime.local(2017, 5, 25, 9, 30).minute //=> 30
       * @type {number}
       */
      get minute() {
        return this.isValid ? this.c.minute : NaN;
      }

      /**
       * Get the second of the minute (0-59).
       * @example DateTime.local(2017, 5, 25, 9, 30, 52).second //=> 52
       * @type {number}
       */
      get second() {
        return this.isValid ? this.c.second : NaN;
      }

      /**
       * Get the millisecond of the second (0-999).
       * @example DateTime.local(2017, 5, 25, 9, 30, 52, 654).millisecond //=> 654
       * @type {number}
       */
      get millisecond() {
        return this.isValid ? this.c.millisecond : NaN;
      }

      /**
       * Get the week year
       * @see https://en.wikipedia.org/wiki/ISO_week_date
       * @example DateTime.local(2014, 11, 31).weekYear //=> 2015
       * @type {number}
       */
      get weekYear() {
        return this.isValid ? possiblyCachedWeekData(this).weekYear : NaN;
      }

      /**
       * Get the week number of the week year (1-52ish).
       * @see https://en.wikipedia.org/wiki/ISO_week_date
       * @example DateTime.local(2017, 5, 25).weekNumber //=> 21
       * @type {number}
       */
      get weekNumber() {
        return this.isValid ? possiblyCachedWeekData(this).weekNumber : NaN;
      }

      /**
       * Get the day of the week.
       * 1 is Monday and 7 is Sunday
       * @see https://en.wikipedia.org/wiki/ISO_week_date
       * @example DateTime.local(2014, 11, 31).weekday //=> 4
       * @type {number}
       */
      get weekday() {
        return this.isValid ? possiblyCachedWeekData(this).weekday : NaN;
      }

      /**
       * Get the ordinal (meaning the day of the year)
       * @example DateTime.local(2017, 5, 25).ordinal //=> 145
       * @type {number|DateTime}
       */
      get ordinal() {
        return this.isValid ? gregorianToOrdinal(this.c).ordinal : NaN;
      }

      /**
       * Get the human readable short month name, such as 'Oct'.
       * Defaults to the system's locale if no locale has been specified
       * @example DateTime.local(2017, 10, 30).monthShort //=> Oct
       * @type {string}
       */
      get monthShort() {
        return this.isValid ? Info.months("short", { locale: this.locale })[this.month - 1] : null;
      }

      /**
       * Get the human readable long month name, such as 'October'.
       * Defaults to the system's locale if no locale has been specified
       * @example DateTime.local(2017, 10, 30).monthLong //=> October
       * @type {string}
       */
      get monthLong() {
        return this.isValid ? Info.months("long", { locale: this.locale })[this.month - 1] : null;
      }

      /**
       * Get the human readable short weekday, such as 'Mon'.
       * Defaults to the system's locale if no locale has been specified
       * @example DateTime.local(2017, 10, 30).weekdayShort //=> Mon
       * @type {string}
       */
      get weekdayShort() {
        return this.isValid ? Info.weekdays("short", { locale: this.locale })[this.weekday - 1] : null;
      }

      /**
       * Get the human readable long weekday, such as 'Monday'.
       * Defaults to the system's locale if no locale has been specified
       * @example DateTime.local(2017, 10, 30).weekdayLong //=> Monday
       * @type {string}
       */
      get weekdayLong() {
        return this.isValid ? Info.weekdays("long", { locale: this.locale })[this.weekday - 1] : null;
      }

      /**
       * Get the UTC offset of this DateTime in minutes
       * @example DateTime.now().offset //=> -240
       * @example DateTime.utc().offset //=> 0
       * @type {number}
       */
      get offset() {
        return this.isValid ? +this.o : NaN;
      }

      /**
       * Get the short human name for the zone's current offset, for example "EST" or "EDT".
       * Defaults to the system's locale if no locale has been specified
       * @type {string}
       */
      get offsetNameShort() {
        if (this.isValid) {
          return this.zone.offsetName(this.ts, {
            format: "short",
            locale: this.locale
          });
        } else {
          return null;
        }
      }

      /**
       * Get the long human name for the zone's current offset, for example "Eastern Standard Time" or "Eastern Daylight Time".
       * Defaults to the system's locale if no locale has been specified
       * @type {string}
       */
      get offsetNameLong() {
        if (this.isValid) {
          return this.zone.offsetName(this.ts, {
            format: "long",
            locale: this.locale
          });
        } else {
          return null;
        }
      }

      /**
       * Get whether this zone's offset ever changes, as in a DST.
       * @type {boolean}
       */
      get isOffsetFixed() {
        return this.isValid ? this.zone.universal : null;
      }

      /**
       * Get whether the DateTime is in a DST.
       * @type {boolean}
       */
      get isInDST() {
        if (this.isOffsetFixed) {
          return false;
        } else {
          return (
            this.offset > this.set({ month: 1 }).offset || this.offset > this.set({ month: 5 }).offset
          );
        }
      }

      /**
       * Returns true if this DateTime is in a leap year, false otherwise
       * @example DateTime.local(2016).isInLeapYear //=> true
       * @example DateTime.local(2013).isInLeapYear //=> false
       * @type {boolean}
       */
      get isInLeapYear() {
        return isLeapYear(this.year);
      }

      /**
       * Returns the number of days in this DateTime's month
       * @example DateTime.local(2016, 2).daysInMonth //=> 29
       * @example DateTime.local(2016, 3).daysInMonth //=> 31
       * @type {number}
       */
      get daysInMonth() {
        return daysInMonth(this.year, this.month);
      }

      /**
       * Returns the number of days in this DateTime's year
       * @example DateTime.local(2016).daysInYear //=> 366
       * @example DateTime.local(2013).daysInYear //=> 365
       * @type {number}
       */
      get daysInYear() {
        return this.isValid ? daysInYear(this.year) : NaN;
      }

      /**
       * Returns the number of weeks in this DateTime's year
       * @see https://en.wikipedia.org/wiki/ISO_week_date
       * @example DateTime.local(2004).weeksInWeekYear //=> 53
       * @example DateTime.local(2013).weeksInWeekYear //=> 52
       * @type {number}
       */
      get weeksInWeekYear() {
        return this.isValid ? weeksInWeekYear(this.weekYear) : NaN;
      }

      /**
       * Returns the resolved Intl options for this DateTime.
       * This is useful in understanding the behavior of formatting methods
       * @param {Object} opts - the same options as toLocaleString
       * @return {Object}
       */
      resolvedLocaleOpts(opts = {}) {
        const { locale, numberingSystem, calendar } = Formatter.create(
          this.loc.clone(opts),
          opts
        ).resolvedOptions(this);
        return { locale, numberingSystem, outputCalendar: calendar };
      }

      // TRANSFORM

      /**
       * "Set" the DateTime's zone to UTC. Returns a newly-constructed DateTime.
       *
       * Equivalent to {@link setZone}('utc')
       * @param {number} [offset=0] - optionally, an offset from UTC in minutes
       * @param {Object} [opts={}] - options to pass to `setZone()`
       * @return {DateTime}
       */
      toUTC(offset = 0, opts = {}) {
        return this.setZone(FixedOffsetZone.instance(offset), opts);
      }

      /**
       * "Set" the DateTime's zone to the host's local zone. Returns a newly-constructed DateTime.
       *
       * Equivalent to `setZone('local')`
       * @return {DateTime}
       */
      toLocal() {
        return this.setZone(Settings.defaultZone);
      }

      /**
       * "Set" the DateTime's zone to specified zone. Returns a newly-constructed DateTime.
       *
       * By default, the setter keeps the underlying time the same (as in, the same timestamp), but the new instance will report different local times and consider DSTs when making computations, as with {@link plus}. You may wish to use {@link toLocal} and {@link toUTC} which provide simple convenience wrappers for commonly used zones.
       * @param {string|Zone} [zone='local'] - a zone identifier. As a string, that can be any IANA zone supported by the host environment, or a fixed-offset name of the form 'UTC+3', or the strings 'local' or 'utc'. You may also supply an instance of a {@link Zone} class.
       * @param {Object} opts - options
       * @param {boolean} [opts.keepLocalTime=false] - If true, adjust the underlying time so that the local time stays the same, but in the target zone. You should rarely need this.
       * @return {DateTime}
       */
      setZone(zone, { keepLocalTime = false, keepCalendarTime = false } = {}) {
        zone = normalizeZone(zone, Settings.defaultZone);
        if (zone.equals(this.zone)) {
          return this;
        } else if (!zone.isValid) {
          return DateTime.invalid(unsupportedZone(zone));
        } else {
          let newTS = this.ts;
          if (keepLocalTime || keepCalendarTime) {
            const offsetGuess = zone.offset(this.ts);
            const asObj = this.toObject();
            [newTS] = objToTS(asObj, offsetGuess, zone);
          }
          return clone$1(this, { ts: newTS, zone });
        }
      }

      /**
       * "Set" the locale, numberingSystem, or outputCalendar. Returns a newly-constructed DateTime.
       * @param {Object} properties - the properties to set
       * @example DateTime.local(2017, 5, 25).reconfigure({ locale: 'en-GB' })
       * @return {DateTime}
       */
      reconfigure({ locale, numberingSystem, outputCalendar } = {}) {
        const loc = this.loc.clone({ locale, numberingSystem, outputCalendar });
        return clone$1(this, { loc });
      }

      /**
       * "Set" the locale. Returns a newly-constructed DateTime.
       * Just a convenient alias for reconfigure({ locale })
       * @example DateTime.local(2017, 5, 25).setLocale('en-GB')
       * @return {DateTime}
       */
      setLocale(locale) {
        return this.reconfigure({ locale });
      }

      /**
       * "Set" the values of specified units. Returns a newly-constructed DateTime.
       * You can only set units with this method; for "setting" metadata, see {@link reconfigure} and {@link setZone}.
       * @param {Object} values - a mapping of units to numbers
       * @example dt.set({ year: 2017 })
       * @example dt.set({ hour: 8, minute: 30 })
       * @example dt.set({ weekday: 5 })
       * @example dt.set({ year: 2005, ordinal: 234 })
       * @return {DateTime}
       */
      set(values) {
        if (!this.isValid) return this;

        const normalized = normalizeObject(values, normalizeUnit, []),
          settingWeekStuff =
            !isUndefined(normalized.weekYear) ||
            !isUndefined(normalized.weekNumber) ||
            !isUndefined(normalized.weekday);

        let mixed;
        if (settingWeekStuff) {
          mixed = weekToGregorian(Object.assign(gregorianToWeek(this.c), normalized));
        } else if (!isUndefined(normalized.ordinal)) {
          mixed = ordinalToGregorian(Object.assign(gregorianToOrdinal(this.c), normalized));
        } else {
          mixed = Object.assign(this.toObject(), normalized);

          // if we didn't set the day but we ended up on an overflow date,
          // use the last day of the right month
          if (isUndefined(normalized.day)) {
            mixed.day = Math.min(daysInMonth(mixed.year, mixed.month), mixed.day);
          }
        }

        const [ts, o] = objToTS(mixed, this.o, this.zone);
        return clone$1(this, { ts, o });
      }

      /**
       * Add a period of time to this DateTime and return the resulting DateTime
       *
       * Adding hours, minutes, seconds, or milliseconds increases the timestamp by the right number of milliseconds. Adding days, months, or years shifts the calendar, accounting for DSTs and leap years along the way. Thus, `dt.plus({ hours: 24 })` may result in a different time than `dt.plus({ days: 1 })` if there's a DST shift in between.
       * @param {Duration|Object|number} duration - The amount to add. Either a Luxon Duration, a number of milliseconds, the object argument to Duration.fromObject()
       * @example DateTime.now().plus(123) //~> in 123 milliseconds
       * @example DateTime.now().plus({ minutes: 15 }) //~> in 15 minutes
       * @example DateTime.now().plus({ days: 1 }) //~> this time tomorrow
       * @example DateTime.now().plus({ days: -1 }) //~> this time yesterday
       * @example DateTime.now().plus({ hours: 3, minutes: 13 }) //~> in 3 hr, 13 min
       * @example DateTime.now().plus(Duration.fromObject({ hours: 3, minutes: 13 })) //~> in 3 hr, 13 min
       * @return {DateTime}
       */
      plus(duration) {
        if (!this.isValid) return this;
        const dur = friendlyDuration(duration);
        return clone$1(this, adjustTime(this, dur));
      }

      /**
       * Subtract a period of time to this DateTime and return the resulting DateTime
       * See {@link plus}
       * @param {Duration|Object|number} duration - The amount to subtract. Either a Luxon Duration, a number of milliseconds, the object argument to Duration.fromObject()
       @return {DateTime}
      */
      minus(duration) {
        if (!this.isValid) return this;
        const dur = friendlyDuration(duration).negate();
        return clone$1(this, adjustTime(this, dur));
      }

      /**
       * "Set" this DateTime to the beginning of a unit of time.
       * @param {string} unit - The unit to go to the beginning of. Can be 'year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', or 'millisecond'.
       * @example DateTime.local(2014, 3, 3).startOf('month').toISODate(); //=> '2014-03-01'
       * @example DateTime.local(2014, 3, 3).startOf('year').toISODate(); //=> '2014-01-01'
       * @example DateTime.local(2014, 3, 3).startOf('week').toISODate(); //=> '2014-03-03', weeks always start on Mondays
       * @example DateTime.local(2014, 3, 3, 5, 30).startOf('day').toISOTime(); //=> '00:00.000-05:00'
       * @example DateTime.local(2014, 3, 3, 5, 30).startOf('hour').toISOTime(); //=> '05:00:00.000-05:00'
       * @return {DateTime}
       */
      startOf(unit) {
        if (!this.isValid) return this;
        const o = {},
          normalizedUnit = Duration.normalizeUnit(unit);
        switch (normalizedUnit) {
          case "years":
            o.month = 1;
          // falls through
          case "quarters":
          case "months":
            o.day = 1;
          // falls through
          case "weeks":
          case "days":
            o.hour = 0;
          // falls through
          case "hours":
            o.minute = 0;
          // falls through
          case "minutes":
            o.second = 0;
          // falls through
          case "seconds":
            o.millisecond = 0;
            break;
          // no default, invalid units throw in normalizeUnit()
        }

        if (normalizedUnit === "weeks") {
          o.weekday = 1;
        }

        if (normalizedUnit === "quarters") {
          const q = Math.ceil(this.month / 3);
          o.month = (q - 1) * 3 + 1;
        }

        return this.set(o);
      }

      /**
       * "Set" this DateTime to the end (meaning the last millisecond) of a unit of time
       * @param {string} unit - The unit to go to the end of. Can be 'year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', or 'millisecond'.
       * @example DateTime.local(2014, 3, 3).endOf('month').toISO(); //=> '2014-03-31T23:59:59.999-05:00'
       * @example DateTime.local(2014, 3, 3).endOf('year').toISO(); //=> '2014-12-31T23:59:59.999-05:00'
       * @example DateTime.local(2014, 3, 3).endOf('week').toISO(); // => '2014-03-09T23:59:59.999-05:00', weeks start on Mondays
       * @example DateTime.local(2014, 3, 3, 5, 30).endOf('day').toISO(); //=> '2014-03-03T23:59:59.999-05:00'
       * @example DateTime.local(2014, 3, 3, 5, 30).endOf('hour').toISO(); //=> '2014-03-03T05:59:59.999-05:00'
       * @return {DateTime}
       */
      endOf(unit) {
        return this.isValid
          ? this.plus({ [unit]: 1 })
              .startOf(unit)
              .minus(1)
          : this;
      }

      // OUTPUT

      /**
       * Returns a string representation of this DateTime formatted according to the specified format string.
       * **You may not want this.** See {@link toLocaleString} for a more flexible formatting tool. For a table of tokens and their interpretations, see [here](https://moment.github.io/luxon/docs/manual/formatting.html#table-of-tokens).
       * Defaults to en-US if no locale has been specified, regardless of the system's locale.
       * @see https://moment.github.io/luxon/docs/manual/formatting.html#table-of-tokens
       * @param {string} fmt - the format string
       * @param {Object} opts - opts to override the configuration options
       * @example DateTime.now().toFormat('yyyy LLL dd') //=> '2017 Apr 22'
       * @example DateTime.now().setLocale('fr').toFormat('yyyy LLL dd') //=> '2017 avr. 22'
       * @example DateTime.now().toFormat('yyyy LLL dd', { locale: "fr" }) //=> '2017 avr. 22'
       * @example DateTime.now().toFormat("HH 'hours and' mm 'minutes'") //=> '20 hours and 55 minutes'
       * @return {string}
       */
      toFormat(fmt, opts = {}) {
        return this.isValid
          ? Formatter.create(this.loc.redefaultToEN(opts)).formatDateTimeFromString(this, fmt)
          : INVALID$2;
      }

      /**
       * Returns a localized string representing this date. Accepts the same options as the Intl.DateTimeFormat constructor and any presets defined by Luxon, such as `DateTime.DATE_FULL` or `DateTime.TIME_SIMPLE`.
       * The exact behavior of this method is browser-specific, but in general it will return an appropriate representation
       * of the DateTime in the assigned locale.
       * Defaults to the system's locale if no locale has been specified
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
       * @param opts {Object} - Intl.DateTimeFormat constructor options and configuration options
       * @example DateTime.now().toLocaleString(); //=> 4/20/2017
       * @example DateTime.now().setLocale('en-gb').toLocaleString(); //=> '20/04/2017'
       * @example DateTime.now().toLocaleString({ locale: 'en-gb' }); //=> '20/04/2017'
       * @example DateTime.now().toLocaleString(DateTime.DATE_FULL); //=> 'April 20, 2017'
       * @example DateTime.now().toLocaleString(DateTime.TIME_SIMPLE); //=> '11:32 AM'
       * @example DateTime.now().toLocaleString(DateTime.DATETIME_SHORT); //=> '4/20/2017, 11:32 AM'
       * @example DateTime.now().toLocaleString({ weekday: 'long', month: 'long', day: '2-digit' }); //=> 'Thursday, April 20'
       * @example DateTime.now().toLocaleString({ weekday: 'short', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }); //=> 'Thu, Apr 20, 11:27 AM'
       * @example DateTime.now().toLocaleString({ hour: '2-digit', minute: '2-digit', hour12: false }); //=> '11:32'
       * @return {string}
       */
      toLocaleString(opts = DATE_SHORT) {
        return this.isValid
          ? Formatter.create(this.loc.clone(opts), opts).formatDateTime(this)
          : INVALID$2;
      }

      /**
       * Returns an array of format "parts", meaning individual tokens along with metadata. This is allows callers to post-process individual sections of the formatted output.
       * Defaults to the system's locale if no locale has been specified
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat/formatToParts
       * @param opts {Object} - Intl.DateTimeFormat constructor options, same as `toLocaleString`.
       * @example DateTime.now().toLocaleParts(); //=> [
       *                                   //=>   { type: 'day', value: '25' },
       *                                   //=>   { type: 'literal', value: '/' },
       *                                   //=>   { type: 'month', value: '05' },
       *                                   //=>   { type: 'literal', value: '/' },
       *                                   //=>   { type: 'year', value: '1982' }
       *                                   //=> ]
       */
      toLocaleParts(opts = {}) {
        return this.isValid
          ? Formatter.create(this.loc.clone(opts), opts).formatDateTimeParts(this)
          : [];
      }

      /**
       * Returns an ISO 8601-compliant string representation of this DateTime
       * @param {Object} opts - options
       * @param {boolean} [opts.suppressMilliseconds=false] - exclude milliseconds from the format if they're 0
       * @param {boolean} [opts.suppressSeconds=false] - exclude seconds from the format if they're 0
       * @param {boolean} [opts.includeOffset=true] - include the offset, such as 'Z' or '-04:00'
       * @param {string} [opts.format='extended'] - choose between the basic and extended format
       * @example DateTime.utc(1982, 5, 25).toISO() //=> '1982-05-25T00:00:00.000Z'
       * @example DateTime.now().toISO() //=> '2017-04-22T20:47:05.335-04:00'
       * @example DateTime.now().toISO({ includeOffset: false }) //=> '2017-04-22T20:47:05.335'
       * @example DateTime.now().toISO({ format: 'basic' }) //=> '20170422T204705.335-0400'
       * @return {string}
       */
      toISO(opts = {}) {
        if (!this.isValid) {
          return null;
        }

        return `${this.toISODate(opts)}T${this.toISOTime(opts)}`;
      }

      /**
       * Returns an ISO 8601-compliant string representation of this DateTime's date component
       * @param {Object} opts - options
       * @param {string} [opts.format='extended'] - choose between the basic and extended format
       * @example DateTime.utc(1982, 5, 25).toISODate() //=> '1982-05-25'
       * @example DateTime.utc(1982, 5, 25).toISODate({ format: 'basic' }) //=> '19820525'
       * @return {string}
       */
      toISODate({ format = "extended" } = {}) {
        let fmt = format === "basic" ? "yyyyMMdd" : "yyyy-MM-dd";
        if (this.year > 9999) {
          fmt = "+" + fmt;
        }

        return toTechFormat(this, fmt);
      }

      /**
       * Returns an ISO 8601-compliant string representation of this DateTime's week date
       * @example DateTime.utc(1982, 5, 25).toISOWeekDate() //=> '1982-W21-2'
       * @return {string}
       */
      toISOWeekDate() {
        return toTechFormat(this, "kkkk-'W'WW-c");
      }

      /**
       * Returns an ISO 8601-compliant string representation of this DateTime's time component
       * @param {Object} opts - options
       * @param {boolean} [opts.suppressMilliseconds=false] - exclude milliseconds from the format if they're 0
       * @param {boolean} [opts.suppressSeconds=false] - exclude seconds from the format if they're 0
       * @param {boolean} [opts.includeOffset=true] - include the offset, such as 'Z' or '-04:00'
       * @param {boolean} [opts.includePrefix=false] - include the `T` prefix
       * @param {string} [opts.format='extended'] - choose between the basic and extended format
       * @example DateTime.utc().set({ hour: 7, minute: 34 }).toISOTime() //=> '07:34:19.361Z'
       * @example DateTime.utc().set({ hour: 7, minute: 34, seconds: 0, milliseconds: 0 }).toISOTime({ suppressSeconds: true }) //=> '07:34Z'
       * @example DateTime.utc().set({ hour: 7, minute: 34 }).toISOTime({ format: 'basic' }) //=> '073419.361Z'
       * @example DateTime.utc().set({ hour: 7, minute: 34 }).toISOTime({ includePrefix: true }) //=> 'T07:34:19.361Z'
       * @return {string}
       */
      toISOTime({
        suppressMilliseconds = false,
        suppressSeconds = false,
        includeOffset = true,
        includePrefix = false,
        format = "extended"
      } = {}) {
        return toTechTimeFormat(this, {
          suppressSeconds,
          suppressMilliseconds,
          includeOffset,
          includePrefix,
          format
        });
      }

      /**
       * Returns an RFC 2822-compatible string representation of this DateTime, always in UTC
       * @example DateTime.utc(2014, 7, 13).toRFC2822() //=> 'Sun, 13 Jul 2014 00:00:00 +0000'
       * @example DateTime.local(2014, 7, 13).toRFC2822() //=> 'Sun, 13 Jul 2014 00:00:00 -0400'
       * @return {string}
       */
      toRFC2822() {
        return toTechFormat(this, "EEE, dd LLL yyyy HH:mm:ss ZZZ", false);
      }

      /**
       * Returns a string representation of this DateTime appropriate for use in HTTP headers.
       * Specifically, the string conforms to RFC 1123.
       * @see https://www.w3.org/Protocols/rfc2616/rfc2616-sec3.html#sec3.3.1
       * @example DateTime.utc(2014, 7, 13).toHTTP() //=> 'Sun, 13 Jul 2014 00:00:00 GMT'
       * @example DateTime.utc(2014, 7, 13, 19).toHTTP() //=> 'Sun, 13 Jul 2014 19:00:00 GMT'
       * @return {string}
       */
      toHTTP() {
        return toTechFormat(this.toUTC(), "EEE, dd LLL yyyy HH:mm:ss 'GMT'");
      }

      /**
       * Returns a string representation of this DateTime appropriate for use in SQL Date
       * @example DateTime.utc(2014, 7, 13).toSQLDate() //=> '2014-07-13'
       * @return {string}
       */
      toSQLDate() {
        return toTechFormat(this, "yyyy-MM-dd");
      }

      /**
       * Returns a string representation of this DateTime appropriate for use in SQL Time
       * @param {Object} opts - options
       * @param {boolean} [opts.includeZone=false] - include the zone, such as 'America/New_York'. Overrides includeOffset.
       * @param {boolean} [opts.includeOffset=true] - include the offset, such as 'Z' or '-04:00'
       * @example DateTime.utc().toSQL() //=> '05:15:16.345'
       * @example DateTime.now().toSQL() //=> '05:15:16.345 -04:00'
       * @example DateTime.now().toSQL({ includeOffset: false }) //=> '05:15:16.345'
       * @example DateTime.now().toSQL({ includeZone: false }) //=> '05:15:16.345 America/New_York'
       * @return {string}
       */
      toSQLTime({ includeOffset = true, includeZone = false } = {}) {
        return toTechTimeFormat(this, {
          includeOffset,
          includeZone,
          spaceZone: true
        });
      }

      /**
       * Returns a string representation of this DateTime appropriate for use in SQL DateTime
       * @param {Object} opts - options
       * @param {boolean} [opts.includeZone=false] - include the zone, such as 'America/New_York'. Overrides includeOffset.
       * @param {boolean} [opts.includeOffset=true] - include the offset, such as 'Z' or '-04:00'
       * @example DateTime.utc(2014, 7, 13).toSQL() //=> '2014-07-13 00:00:00.000 Z'
       * @example DateTime.local(2014, 7, 13).toSQL() //=> '2014-07-13 00:00:00.000 -04:00'
       * @example DateTime.local(2014, 7, 13).toSQL({ includeOffset: false }) //=> '2014-07-13 00:00:00.000'
       * @example DateTime.local(2014, 7, 13).toSQL({ includeZone: true }) //=> '2014-07-13 00:00:00.000 America/New_York'
       * @return {string}
       */
      toSQL(opts = {}) {
        if (!this.isValid) {
          return null;
        }

        return `${this.toSQLDate()} ${this.toSQLTime(opts)}`;
      }

      /**
       * Returns a string representation of this DateTime appropriate for debugging
       * @return {string}
       */
      toString() {
        return this.isValid ? this.toISO() : INVALID$2;
      }

      /**
       * Returns the epoch milliseconds of this DateTime. Alias of {@link toMillis}
       * @return {number}
       */
      valueOf() {
        return this.toMillis();
      }

      /**
       * Returns the epoch milliseconds of this DateTime.
       * @return {number}
       */
      toMillis() {
        return this.isValid ? this.ts : NaN;
      }

      /**
       * Returns the epoch seconds of this DateTime.
       * @return {number}
       */
      toSeconds() {
        return this.isValid ? this.ts / 1000 : NaN;
      }

      /**
       * Returns an ISO 8601 representation of this DateTime appropriate for use in JSON.
       * @return {string}
       */
      toJSON() {
        return this.toISO();
      }

      /**
       * Returns a BSON serializable equivalent to this DateTime.
       * @return {Date}
       */
      toBSON() {
        return this.toJSDate();
      }

      /**
       * Returns a JavaScript object with this DateTime's year, month, day, and so on.
       * @param opts - options for generating the object
       * @param {boolean} [opts.includeConfig=false] - include configuration attributes in the output
       * @example DateTime.now().toObject() //=> { year: 2017, month: 4, day: 22, hour: 20, minute: 49, second: 42, millisecond: 268 }
       * @return {Object}
       */
      toObject(opts = {}) {
        if (!this.isValid) return {};

        const base = Object.assign({}, this.c);

        if (opts.includeConfig) {
          base.outputCalendar = this.outputCalendar;
          base.numberingSystem = this.loc.numberingSystem;
          base.locale = this.loc.locale;
        }
        return base;
      }

      /**
       * Returns a JavaScript Date equivalent to this DateTime.
       * @return {Date}
       */
      toJSDate() {
        return new Date(this.isValid ? this.ts : NaN);
      }

      // COMPARE

      /**
       * Return the difference between two DateTimes as a Duration.
       * @param {DateTime} otherDateTime - the DateTime to compare this one to
       * @param {string|string[]} [unit=['milliseconds']] - the unit or array of units (such as 'hours' or 'days') to include in the duration.
       * @param {Object} opts - options that affect the creation of the Duration
       * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
       * @example
       * var i1 = DateTime.fromISO('1982-05-25T09:45'),
       *     i2 = DateTime.fromISO('1983-10-14T10:30');
       * i2.diff(i1).toObject() //=> { milliseconds: 43807500000 }
       * i2.diff(i1, 'hours').toObject() //=> { hours: 12168.75 }
       * i2.diff(i1, ['months', 'days']).toObject() //=> { months: 16, days: 19.03125 }
       * i2.diff(i1, ['months', 'days', 'hours']).toObject() //=> { months: 16, days: 19, hours: 0.75 }
       * @return {Duration}
       */
      diff(otherDateTime, unit = "milliseconds", opts = {}) {
        if (!this.isValid || !otherDateTime.isValid) {
          return Duration.invalid(
            this.invalid || otherDateTime.invalid,
            "created by diffing an invalid DateTime"
          );
        }

        const durOpts = Object.assign(
          { locale: this.locale, numberingSystem: this.numberingSystem },
          opts
        );

        const units = maybeArray(unit).map(Duration.normalizeUnit),
          otherIsLater = otherDateTime.valueOf() > this.valueOf(),
          earlier = otherIsLater ? this : otherDateTime,
          later = otherIsLater ? otherDateTime : this,
          diffed = diff(earlier, later, units, durOpts);

        return otherIsLater ? diffed.negate() : diffed;
      }

      /**
       * Return the difference between this DateTime and right now.
       * See {@link diff}
       * @param {string|string[]} [unit=['milliseconds']] - the unit or units units (such as 'hours' or 'days') to include in the duration
       * @param {Object} opts - options that affect the creation of the Duration
       * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
       * @return {Duration}
       */
      diffNow(unit = "milliseconds", opts = {}) {
        return this.diff(DateTime.now(), unit, opts);
      }

      /**
       * Return an Interval spanning between this DateTime and another DateTime
       * @param {DateTime} otherDateTime - the other end point of the Interval
       * @return {Interval}
       */
      until(otherDateTime) {
        return this.isValid ? Interval.fromDateTimes(this, otherDateTime) : this;
      }

      /**
       * Return whether this DateTime is in the same unit of time as another DateTime.
       * Higher-order units must also be identical for this function to return `true`.
       * Note that time zones are **ignored** in this comparison, which compares the **local** calendar time. Use {@link setZone} to convert one of the dates if needed.
       * @param {DateTime} otherDateTime - the other DateTime
       * @param {string} unit - the unit of time to check sameness on
       * @example DateTime.now().hasSame(otherDT, 'day'); //~> true if otherDT is in the same current calendar day
       * @return {boolean}
       */
      hasSame(otherDateTime, unit) {
        if (!this.isValid) return false;

        const inputMs = otherDateTime.valueOf();
        const otherZoneDateTime = this.setZone(otherDateTime.zone, { keepLocalTime: true });
        return otherZoneDateTime.startOf(unit) <= inputMs && inputMs <= otherZoneDateTime.endOf(unit);
      }

      /**
       * Equality check
       * Two DateTimes are equal iff they represent the same millisecond, have the same zone and location, and are both valid.
       * To compare just the millisecond values, use `+dt1 === +dt2`.
       * @param {DateTime} other - the other DateTime
       * @return {boolean}
       */
      equals(other) {
        return (
          this.isValid &&
          other.isValid &&
          this.valueOf() === other.valueOf() &&
          this.zone.equals(other.zone) &&
          this.loc.equals(other.loc)
        );
      }

      /**
       * Returns a string representation of a this time relative to now, such as "in two days". Can only internationalize if your
       * platform supports Intl.RelativeTimeFormat. Rounds down by default.
       * @param {Object} options - options that affect the output
       * @param {DateTime} [options.base=DateTime.now()] - the DateTime to use as the basis to which this time is compared. Defaults to now.
       * @param {string} [options.style="long"] - the style of units, must be "long", "short", or "narrow"
       * @param {string} options.unit - use a specific unit; if omitted, the method will pick the unit. Use one of "years", "quarters", "months", "weeks", "days", "hours", "minutes", or "seconds"
       * @param {boolean} [options.round=true] - whether to round the numbers in the output.
       * @param {number} [options.padding=0] - padding in milliseconds. This allows you to round up the result if it fits inside the threshold. Don't use in combination with {round: false} because the decimal output will include the padding.
       * @param {string} options.locale - override the locale of this DateTime
       * @param {string} options.numberingSystem - override the numberingSystem of this DateTime. The Intl system may choose not to honor this
       * @example DateTime.now().plus({ days: 1 }).toRelative() //=> "in 1 day"
       * @example DateTime.now().setLocale("es").toRelative({ days: 1 }) //=> "dentro de 1 día"
       * @example DateTime.now().plus({ days: 1 }).toRelative({ locale: "fr" }) //=> "dans 23 heures"
       * @example DateTime.now().minus({ days: 2 }).toRelative() //=> "2 days ago"
       * @example DateTime.now().minus({ days: 2 }).toRelative({ unit: "hours" }) //=> "48 hours ago"
       * @example DateTime.now().minus({ hours: 36 }).toRelative({ round: false }) //=> "1.5 days ago"
       */
      toRelative(options = {}) {
        if (!this.isValid) return null;
        const base = options.base || DateTime.fromObject({ zone: this.zone }),
          padding = options.padding ? (this < base ? -options.padding : options.padding) : 0;
        return diffRelative(
          base,
          this.plus(padding),
          Object.assign(options, {
            numeric: "always",
            units: ["years", "months", "days", "hours", "minutes", "seconds"]
          })
        );
      }

      /**
       * Returns a string representation of this date relative to today, such as "yesterday" or "next month".
       * Only internationalizes on platforms that supports Intl.RelativeTimeFormat.
       * @param {Object} options - options that affect the output
       * @param {DateTime} [options.base=DateTime.now()] - the DateTime to use as the basis to which this time is compared. Defaults to now.
       * @param {string} options.locale - override the locale of this DateTime
       * @param {string} options.unit - use a specific unit; if omitted, the method will pick the unit. Use one of "years", "quarters", "months", "weeks", or "days"
       * @param {string} options.numberingSystem - override the numberingSystem of this DateTime. The Intl system may choose not to honor this
       * @example DateTime.now().plus({ days: 1 }).toRelativeCalendar() //=> "tomorrow"
       * @example DateTime.now().setLocale("es").plus({ days: 1 }).toRelative() //=> ""mañana"
       * @example DateTime.now().plus({ days: 1 }).toRelativeCalendar({ locale: "fr" }) //=> "demain"
       * @example DateTime.now().minus({ days: 2 }).toRelativeCalendar() //=> "2 days ago"
       */
      toRelativeCalendar(options = {}) {
        if (!this.isValid) return null;

        return diffRelative(
          options.base || DateTime.fromObject({ zone: this.zone }),
          this,
          Object.assign(options, {
            numeric: "auto",
            units: ["years", "months", "days"],
            calendary: true
          })
        );
      }

      /**
       * Return the min of several date times
       * @param {...DateTime} dateTimes - the DateTimes from which to choose the minimum
       * @return {DateTime} the min DateTime, or undefined if called with no argument
       */
      static min(...dateTimes) {
        if (!dateTimes.every(DateTime.isDateTime)) {
          throw new InvalidArgumentError("min requires all arguments be DateTimes");
        }
        return bestBy(dateTimes, i => i.valueOf(), Math.min);
      }

      /**
       * Return the max of several date times
       * @param {...DateTime} dateTimes - the DateTimes from which to choose the maximum
       * @return {DateTime} the max DateTime, or undefined if called with no argument
       */
      static max(...dateTimes) {
        if (!dateTimes.every(DateTime.isDateTime)) {
          throw new InvalidArgumentError("max requires all arguments be DateTimes");
        }
        return bestBy(dateTimes, i => i.valueOf(), Math.max);
      }

      // MISC

      /**
       * Explain how a string would be parsed by fromFormat()
       * @param {string} text - the string to parse
       * @param {string} fmt - the format the string is expected to be in (see description)
       * @param {Object} options - options taken by fromFormat()
       * @return {Object}
       */
      static fromFormatExplain(text, fmt, options = {}) {
        const { locale = null, numberingSystem = null } = options,
          localeToUse = Locale.fromOpts({
            locale,
            numberingSystem,
            defaultToEN: true
          });
        return explainFromTokens(localeToUse, text, fmt);
      }

      /**
       * @deprecated use fromFormatExplain instead
       */
      static fromStringExplain(text, fmt, options = {}) {
        return DateTime.fromFormatExplain(text, fmt, options);
      }

      // FORMAT PRESETS

      /**
       * {@link toLocaleString} format like 10/14/1983
       * @type {Object}
       */
      static get DATE_SHORT() {
        return DATE_SHORT;
      }

      /**
       * {@link toLocaleString} format like 'Oct 14, 1983'
       * @type {Object}
       */
      static get DATE_MED() {
        return DATE_MED;
      }

      /**
       * {@link toLocaleString} format like 'Fri, Oct 14, 1983'
       * @type {Object}
       */
      static get DATE_MED_WITH_WEEKDAY() {
        return DATE_MED_WITH_WEEKDAY;
      }

      /**
       * {@link toLocaleString} format like 'October 14, 1983'
       * @type {Object}
       */
      static get DATE_FULL() {
        return DATE_FULL;
      }

      /**
       * {@link toLocaleString} format like 'Tuesday, October 14, 1983'
       * @type {Object}
       */
      static get DATE_HUGE() {
        return DATE_HUGE;
      }

      /**
       * {@link toLocaleString} format like '09:30 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get TIME_SIMPLE() {
        return TIME_SIMPLE;
      }

      /**
       * {@link toLocaleString} format like '09:30:23 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get TIME_WITH_SECONDS() {
        return TIME_WITH_SECONDS;
      }

      /**
       * {@link toLocaleString} format like '09:30:23 AM EDT'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get TIME_WITH_SHORT_OFFSET() {
        return TIME_WITH_SHORT_OFFSET;
      }

      /**
       * {@link toLocaleString} format like '09:30:23 AM Eastern Daylight Time'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get TIME_WITH_LONG_OFFSET() {
        return TIME_WITH_LONG_OFFSET;
      }

      /**
       * {@link toLocaleString} format like '09:30', always 24-hour.
       * @type {Object}
       */
      static get TIME_24_SIMPLE() {
        return TIME_24_SIMPLE;
      }

      /**
       * {@link toLocaleString} format like '09:30:23', always 24-hour.
       * @type {Object}
       */
      static get TIME_24_WITH_SECONDS() {
        return TIME_24_WITH_SECONDS;
      }

      /**
       * {@link toLocaleString} format like '09:30:23 EDT', always 24-hour.
       * @type {Object}
       */
      static get TIME_24_WITH_SHORT_OFFSET() {
        return TIME_24_WITH_SHORT_OFFSET;
      }

      /**
       * {@link toLocaleString} format like '09:30:23 Eastern Daylight Time', always 24-hour.
       * @type {Object}
       */
      static get TIME_24_WITH_LONG_OFFSET() {
        return TIME_24_WITH_LONG_OFFSET;
      }

      /**
       * {@link toLocaleString} format like '10/14/1983, 9:30 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_SHORT() {
        return DATETIME_SHORT;
      }

      /**
       * {@link toLocaleString} format like '10/14/1983, 9:30:33 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_SHORT_WITH_SECONDS() {
        return DATETIME_SHORT_WITH_SECONDS;
      }

      /**
       * {@link toLocaleString} format like 'Oct 14, 1983, 9:30 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_MED() {
        return DATETIME_MED;
      }

      /**
       * {@link toLocaleString} format like 'Oct 14, 1983, 9:30:33 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_MED_WITH_SECONDS() {
        return DATETIME_MED_WITH_SECONDS;
      }

      /**
       * {@link toLocaleString} format like 'Fri, 14 Oct 1983, 9:30 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_MED_WITH_WEEKDAY() {
        return DATETIME_MED_WITH_WEEKDAY;
      }

      /**
       * {@link toLocaleString} format like 'October 14, 1983, 9:30 AM EDT'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_FULL() {
        return DATETIME_FULL;
      }

      /**
       * {@link toLocaleString} format like 'October 14, 1983, 9:30:33 AM EDT'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_FULL_WITH_SECONDS() {
        return DATETIME_FULL_WITH_SECONDS;
      }

      /**
       * {@link toLocaleString} format like 'Friday, October 14, 1983, 9:30 AM Eastern Daylight Time'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_HUGE() {
        return DATETIME_HUGE;
      }

      /**
       * {@link toLocaleString} format like 'Friday, October 14, 1983, 9:30:33 AM Eastern Daylight Time'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_HUGE_WITH_SECONDS() {
        return DATETIME_HUGE_WITH_SECONDS;
      }
    }

    /**
     * @private
     */
    function friendlyDateTime(dateTimeish) {
      if (DateTime.isDateTime(dateTimeish)) {
        return dateTimeish;
      } else if (dateTimeish && dateTimeish.valueOf && isNumber(dateTimeish.valueOf())) {
        return DateTime.fromJSDate(dateTimeish);
      } else if (dateTimeish && typeof dateTimeish === "object") {
        return DateTime.fromObject(dateTimeish);
      } else {
        throw new InvalidArgumentError(
          `Unknown datetime argument: ${dateTimeish}, of type ${typeof dateTimeish}`
        );
      }
    }

    function getCurWeekId() {
        const datetime = DateTime.now();
        const days = datetime.weekday - 1;
        return "bfuze-dnci-" + datetime.minus(Duration.fromObject({ days })).toSQLDate();
    }
    function isNoClockInWeek() {
        const weekId = getCurWeekId();
        return !!localStorage.getItem(weekId);
    }
    function toggleWeek() {
        const weekId = getCurWeekId();
        let newState = !isNoClockInWeek();
        if (newState) {
            localStorage.setItem(weekId, "1");
        }
        else {
            localStorage.removeItem(weekId);
        }
        return newState;
    }

    const isNoClock = reactive(isNoClockInWeek());
    class ReminderUi extends DestinyElement {
        constructor() {
            super(...arguments);
            this.template = xml `
    <style>
      main {
        position: fixed;
        z-index: 10000;
        left: 0;
        top: 0;
        width: 100vw;
        height: 100vh;

        visibility: hidden;
        pointer-events: none;

        font-family: Ubuntu, Arial, sans-serif;
      }

      main > * {
        visibility: visible;
        pointer-events: auto;
      }

      div.reminder-screen {
        position: absolute;
        display: flex;
        justify-content: center;
        align-items: center;

        left: 0;
        top: 0;
        bottom: 0;
        right: 0;

        color: #fff;
        background: rgba(0, 0, 0, 0.75);
      }

      div.control {
        --distance: 30px;

        position: absolute;
        left: var(--distance);
        bottom: var(--distance);
        padding: 20px;

        border-radius: 4px;
        background: #222;
        color: #ddd;
      }

      div.control button {
        border-radius: 0px;
        border: 0px;

        padding: 10px 13px;
      }

      p {
        text-align: center;
        margin-bottom: 0;
        margin-top: 10px;

        font-size: 11px;
        opacity: 0.5;
      }
    </style>

    <main>
        <div class="control">
          <button on:click="${() => (isNoClock.value = toggleWeek())}">
            ${isNoClock.pipe(bool => bool ? "Disable" : "Enable")} reminder for this week
          </button>
          <p style="text-align: center;">
            <em>Don't you dare screw up this time</em>
          </p>
        </div>
    </main>
  `;
        }
    }
    register(ReminderUi);

    const isNoClock$1 = reactive(false);
    class OverlayUi extends DestinyElement {
        constructor() {
            super(...arguments);
            this.template = xml `
    <style>
      main {
        position: fixed;
        z-index: 10000;
        left: 0;
        top: 0;
        width: 100vw;
        height: 100vh;

        visibility: hidden;
        pointer-events: none;

        font-family: Ubuntu, Arial, sans-serif;
      }

      main > * {
        visibility: visible;
        pointer-events: auto;
      }

      div.reminder-screen {
        position: absolute;
        display: flex;
        justify-content: center;
        align-items: center;

        left: 0;
        top: 0;
        bottom: 0;
        right: 0;

        color: #fff;
        background: rgba(0, 0, 0, 0.75);
      }

      h1 {
        font-size: 20px;
        text-align: center;
      }
    </style>

    <main>
      ${isNoClock$1.pipe(bool => bool
            ? xml `
          <div class="reminder-screen">
            <h1>You're not supposed to be clocking in!</h1>
          </div>
        `
            : xml ``)}
    </main>
  `;
        }
    }
    register(OverlayUi);

    const hostname = "*";
    function iframe(onChange) {
        addEventListener("message", (evt) => {
            const { orgAzuga } = evt.data ?? {};
            if (orgAzuga) {
                onChange(orgAzuga.isNoClock);
            }
        });
        // Register with parent frame
        let registerMsg = {
            orgAzuga: { register: true },
        };
        parent.postMessage(registerMsg, hostname);
    }
    function newChangeMessage(isNoClock) {
        return {
            orgAzuga: { isNoClock },
        };
    }
    function parentFrame(setChildFrame, isNoClockInitial) {
        let childWindow;
        addEventListener("message", (evt) => {
            const { orgAzuga } = evt.data ?? {};
            if (orgAzuga?.register) {
                childWindow = setChildFrame().contentWindow;
                childWindow?.postMessage(newChangeMessage(isNoClockInitial), hostname);
            }
        });
        return (isNoClock) => {
            childWindow?.postMessage(newChangeMessage(isNoClock), hostname);
        };
    }

    addEventListener("DOMContentLoaded", () => {
        const isTimePunchFrame = !!document.getElementById("TL_RPT_TIME_FLU");
        const isDashboard = !!document.getElementById("PT_FLDASHBOARD");
        if (isTimePunchFrame) {
            document.body.appendChild(document.createElement("overlay-ui"));
            iframe((isNoClock) => {
                isNoClock$1.set(isNoClock);
            });
        }
        if (isDashboard) {
            document.body.appendChild(document.createElement("reminder-ui"));
            const updateChild = parentFrame(() => document.querySelector('iframe[title="Report Time"]'), isNoClock.value);
            // Update child frame when stuff change
            isNoClock.bind((isNoClock) => {
                updateChild(isNoClock);
            });
        }
    });

}());
