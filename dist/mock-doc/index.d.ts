export declare class MockAttributeMap {
    caseInsensitive: boolean;
    items: MockAttr[];
    constructor(caseInsensitive?: boolean);
    readonly length: number;
    item(index: number): MockAttr;
    setNamedItem(attr: MockAttr): void;
    setNamedItemNS(attr: MockAttr): void;
    getNamedItem(attrName: string): MockAttr;
    getNamedItemNS(namespaceURI: string, attrName: string): MockAttr;
    removeNamedItem(attr: MockAttr): void;
    removeNamedItemNS(attr: MockAttr): void;
}
export declare function cloneAttributes(srcAttrs: MockAttributeMap, sortByName?: boolean): MockAttributeMap;
export declare class MockAttr {
    private _name;
    private _value;
    private _namespaceURI;
    constructor(attrName: string, attrValue: string, namespaceURI?: string);
    name: string;
    value: string;
    nodeName: string;
    nodeValue: string;
    namespaceURI: string;
}
export declare class MockClassList {
    private elm;
    constructor(elm: HTMLElement);
    add(...classNames: string[]): void;
    remove(...classNames: string[]): void;
    contains(className: string): boolean;
    toggle(className: string): void;
    readonly length: number;
    item(index: number): string;
    toString(): string;
}
export declare class MockComment extends MockNode {
    constructor(ownerDocument: any, data: string);
    cloneNode(_deep?: boolean): MockComment;
    textContent: string;
}
export declare function createConsole(): any;
export declare const enum NODE_TYPES {
    ELEMENT_NODE = 1,
    TEXT_NODE = 3,
    PROCESSING_INSTRUCTION_NODE = 7,
    COMMENT_NODE = 8,
    DOCUMENT_NODE = 9,
    DOCUMENT_TYPE_NODE = 10,
    DOCUMENT_FRAGMENT_NODE = 11
}
export declare const enum NODE_NAMES {
    COMMENT_NODE = "#comment",
    DOCUMENT_NODE = "#document",
    DOCUMENT_FRAGMENT_NODE = "#document-fragment",
    TEXT_NODE = "#text"
}
export declare class CSSStyleDeclaration {
    private _styles;
    setProperty(prop: string, value: string): void;
    getPropertyValue(prop: string): string;
    removeProperty(prop: string): void;
    readonly length: number;
    cssText: string;
}
export declare function createCSSStyleDeclaration(): CSSStyleDeclaration;
export declare class MockCustomElementRegistry implements CustomElementRegistry {
    private win;
    private __registry;
    private __whenDefined;
    constructor(win: Window);
    define(tagName: string, cstr: any, options?: any): void;
    get(tagName: string): any;
    upgrade(_rootNode: any): void;
    clear(): void;
    whenDefined(tagName: string): Promise<void>;
}
export declare function createCustomElement(customElements: MockCustomElementRegistry, ownerDocument: any, tagName: string): any;
export declare function connectNode(ownerDocument: any, node: MockNode): void;
export declare function disconnectNode(node: MockNode): void;
export declare function attributeChanged(node: MockNode, attrName: string, oldValue: string, newValue: string): void;
export declare function checkAttributeChanged(node: MockNode): boolean;
export declare function dataset(elm: MockElement): any;
export declare class MockDocumentFragment extends MockHTMLElement {
    constructor(ownerDocument: any);
    getElementById(id: string): import("./node").MockElement;
    cloneNode(deep?: boolean): MockDocumentFragment;
}
export declare class MockDocumentTypeNode extends MockHTMLElement {
    constructor(ownerDocument: any);
}
export declare class MockDocument extends MockHTMLElement {
    defaultView: any;
    cookie: string;
    referrer: string;
    constructor(html?: string | boolean, win?: any);
    location: Location;
    readonly baseURI: string;
    readonly URL: string;
    readonly styleSheets: MockElement[];
    readonly scripts: MockElement[];
    readonly forms: MockElement[];
    readonly images: MockElement[];
    readonly scrollingElement: MockElement;
    documentElement: MockElement;
    head: MockElement;
    body: MockElement;
    appendChild(newNode: MockElement): MockElement;
    createComment(data: string): MockComment;
    createAttribute(attrName: string): MockAttr;
    createAttributeNS(namespaceURI: string, attrName: string): MockAttr;
    createElement(tagName: string): any;
    createElementNS(namespaceURI: string, tagName: string): any;
    createTextNode(text: string): MockTextNode;
    createDocumentFragment(): MockDocumentFragment;
    createDocumentTypeNode(): MockDocumentTypeNode;
    getElementById(id: string): MockElement;
    getElementsByName(elmName: string): MockElement[];
    title: string;
}
export declare function createDocument(html?: string | boolean): Document;
export declare function createFragment(html?: string): DocumentFragment;
export declare function resetDocument(doc: Document): void;
export declare function getElementById(elm: MockElement, id: string): MockElement;
export declare function setOwnerDocument(elm: MockElement, ownerDocument: any): void;
export declare function createElement(ownerDocument: any, tagName: string): any;
export declare function createElementNS(ownerDocument: any, namespaceURI: string, tagName: string): any;
export declare class MockSVGElement extends MockElement {
    readonly ownerSVGElement: SVGSVGElement;
    readonly viewportElement: SVGElement;
    focus(): void;
    onunload(): void;
    readonly pathLength: number;
    isPointInFill(_pt: DOMPoint): boolean;
    isPointInStroke(_pt: DOMPoint): boolean;
    getTotalLength(): number;
}
export declare class MockBaseElement extends MockHTMLElement {
    constructor(ownerDocument: any);
    href: string;
}
export declare class MockTemplateElement extends MockHTMLElement {
    content: MockDocumentFragment;
    constructor(ownerDocument: any);
    innerHTML: string;
    cloneNode(deep?: boolean): MockTemplateElement;
}
export declare class MockEvent {
    bubbles: boolean;
    cancelBubble: boolean;
    cancelable: boolean;
    composed: boolean;
    currentTarget: MockElement;
    defaultPrevented: boolean;
    srcElement: MockElement;
    target: MockElement;
    timeStamp: number;
    type: string;
    constructor(type: string, eventInitDict?: EventInit);
    preventDefault(): void;
    stopPropagation(): void;
    stopImmediatePropagation(): void;
}
export declare class MockCustomEvent extends MockEvent {
    detail: any;
    constructor(type: string, customEventInitDic?: CustomEventInit);
}
export declare class MockKeyboardEvent extends MockEvent {
    code: string;
    key: string;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    location: number;
    repeat: boolean;
    constructor(type: string, keyboardEventInitDic?: KeyboardEventInit);
}
export declare class MockMouseEvent extends MockEvent {
    screenX: number;
    screenY: number;
    clientX: number;
    clientY: number;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    button: number;
    buttons: number;
    relatedTarget: EventTarget;
    constructor(type: string, mouseEventInitDic?: MouseEventInit);
}
export declare class MockEventListener {
    type: string;
    handler: (ev?: any) => void;
    constructor(type: string, handler: any);
}
export declare function addEventListener(elm: any, type: string, handler: any): void;
export declare function removeEventListener(elm: any, type: string, handler: any): void;
export declare function resetEventListeners(target: any): void;
export declare function dispatchEvent(currentTarget: any, ev: MockEvent): boolean;
export interface EventTarget {
    __listeners: MockEventListener[];
}
export declare function setupGlobal(gbl: any): any;
export declare function teardownGlobal(gbl: any): void;
export declare function patchWindow(winToBePatched: any): void;
export declare class MockHistory {
    private items;
    readonly length: number;
    back(): void;
    forward(): void;
    go(_value: number): void;
    pushState(_state: any, _title: string, _url: string): void;
    replaceState(_state: any, _title: string, _url: string): void;
}
export declare class MockIntersectionObserver {
    constructor();
    disconnect(): void;
    observe(): void;
    takeRecords(): any[];
    unobserve(): void;
}
export declare class MockLocation implements Location {
    ancestorOrigins: any;
    protocol: string;
    host: string;
    hostname: string;
    port: string;
    pathname: string;
    search: string;
    hash: string;
    username: string;
    password: string;
    origin: string;
    private _href;
    href: string;
    assign(_url: string): void;
    reload(_forcedReload?: boolean): void;
    replace(_url: string): void;
    toString(): string;
}
export declare class MockNavigator {
    appCodeName: string;
    appName: string;
    appVersion: string;
    platform: string;
    userAgent: string;
}
export declare class MockNode {
    nodeName: string;
    nodeType: number;
    nodeValue: string;
    ownerDocument: any;
    parentNode: MockNode;
    childNodes: MockNode[];
    constructor(ownerDocument: any, nodeType: number, nodeName: string, nodeValue: string);
    appendChild(newNode: MockNode): MockNode;
    append(...items: (MockNode | string)[]): void;
    prepend(...items: (MockNode | string)[]): void;
    cloneNode(deep?: boolean): MockNode;
    readonly firstChild: MockNode;
    insertBefore(newNode: MockNode, referenceNode: MockNode): MockNode;
    readonly isConnected: boolean;
    isSameNode(node: any): boolean;
    readonly lastChild: MockNode;
    readonly nextSibling: MockNode;
    parentElement: any;
    readonly previousSibling: MockNode;
    contains(otherNode: MockNode): boolean;
    removeChild(childNode: MockNode): MockNode;
    remove(): void;
    replaceChild(newChild: MockNode, oldChild: MockNode): MockNode;
    textContent: string;
    static ELEMENT_NODE: number;
    static TEXT_NODE: number;
    static PROCESSING_INSTRUCTION_NODE: number;
    static COMMENT_NODE: number;
    static DOCUMENT_NODE: number;
    static DOCUMENT_TYPE_NODE: number;
    static DOCUMENT_FRAGMENT_NODE: number;
}
export declare class MockNodeList {
    childNodes: MockNode[];
    length: number;
    ownerDocument: any;
    constructor(ownerDocument: any, childNodes: MockNode[], length: number);
}
export declare class MockElement extends MockNode {
    namespaceURI: string;
    __attributeMap: MockAttributeMap;
    __shadowRoot: ShadowRoot;
    __style: CSSStyleDeclaration;
    constructor(ownerDocument: any, nodeName: string);
    addEventListener(type: string, handler: (ev?: any) => void): void;
    attachShadow(_opts: ShadowRootInit): any;
    shadowRoot: any;
    attributes: MockAttributeMap;
    readonly children: MockElement[];
    readonly childElementCount: number;
    className: string;
    readonly classList: MockClassList;
    click(): void;
    cloneNode(_deep?: boolean): MockElement;
    closest(selector: string): MockElement;
    readonly dataset: any;
    dir: string;
    dispatchEvent(ev: MockEvent): boolean;
    readonly firstElementChild: MockElement;
    getAttribute(attrName: string): any;
    getAttributeNS(namespaceURI: string, attrName: string): string;
    getBoundingClientRect(): {
        bottom: number;
        height: number;
        left: number;
        right: number;
        top: number;
        width: number;
        x: number;
        y: number;
    };
    getRootNode(opts?: {
        composed?: boolean;
        [key: string]: any;
    }): Node;
    hasChildNodes(): boolean;
    id: string;
    innerHTML: string;
    innerText: string;
    hasAttribute(attrName: string): boolean;
    hasAttributeNS(namespaceURI: string, name: string): boolean;
    hidden: boolean;
    lang: string;
    readonly lastElementChild: MockElement;
    matches(selector: string): boolean;
    readonly nextElementSibling: any;
    readonly outerHTML: string;
    readonly previousElementSibling: any;
    getElementsByClassName(classNames: string): MockElement[];
    getElementsByTagName(tagName: string): MockElement[];
    querySelector(selector: string): MockElement;
    querySelectorAll(selector: string): MockElement[];
    removeAttribute(attrName: string): void;
    removeAttributeNS(namespaceURI: string, attrName: string): void;
    removeEventListener(type: string, handler: any): void;
    setAttribute(attrName: string, value: any): void;
    setAttributeNS(namespaceURI: string, attrName: string, value: any): void;
    style: any;
    tabIndex: number;
    tagName: string;
    textContent: string;
    title: string;
    onanimationstart(): void;
    onanimationend(): void;
    onanimationiteration(): void;
    onabort(): void;
    onauxclick(): void;
    onbeforecopy(): void;
    onbeforecut(): void;
    onbeforepaste(): void;
    onblur(): void;
    oncancel(): void;
    oncanplay(): void;
    oncanplaythrough(): void;
    onchange(): void;
    onclick(): void;
    onclose(): void;
    oncontextmenu(): void;
    oncopy(): void;
    oncuechange(): void;
    oncut(): void;
    ondblclick(): void;
    ondrag(): void;
    ondragend(): void;
    ondragenter(): void;
    ondragleave(): void;
    ondragover(): void;
    ondragstart(): void;
    ondrop(): void;
    ondurationchange(): void;
    onemptied(): void;
    onended(): void;
    onerror(): void;
    onfocus(): void;
    onformdata(): void;
    onfullscreenchange(): void;
    onfullscreenerror(): void;
    ongotpointercapture(): void;
    oninput(): void;
    oninvalid(): void;
    onkeydown(): void;
    onkeypress(): void;
    onkeyup(): void;
    onload(): void;
    onloadeddata(): void;
    onloadedmetadata(): void;
    onloadstart(): void;
    onlostpointercapture(): void;
    onmousedown(): void;
    onmouseenter(): void;
    onmouseleave(): void;
    onmousemove(): void;
    onmouseout(): void;
    onmouseover(): void;
    onmouseup(): void;
    onmousewheel(): void;
    onpaste(): void;
    onpause(): void;
    onplay(): void;
    onplaying(): void;
    onpointercancel(): void;
    onpointerdown(): void;
    onpointerenter(): void;
    onpointerleave(): void;
    onpointermove(): void;
    onpointerout(): void;
    onpointerover(): void;
    onpointerup(): void;
    onprogress(): void;
    onratechange(): void;
    onreset(): void;
    onresize(): void;
    onscroll(): void;
    onsearch(): void;
    onseeked(): void;
    onseeking(): void;
    onselect(): void;
    onselectstart(): void;
    onstalled(): void;
    onsubmit(): void;
    onsuspend(): void;
    ontimeupdate(): void;
    ontoggle(): void;
    onvolumechange(): void;
    onwaiting(): void;
    onwebkitfullscreenchange(): void;
    onwebkitfullscreenerror(): void;
    onwheel(): void;
    toString(opts?: SerializeNodeToHtmlOptions): string;
}
export declare function resetElement(elm: MockElement): void;
export declare class MockHTMLElement extends MockElement {
    namespaceURI: string;
    constructor(ownerDocument: any, nodeName: string);
    tagName: string;
    attributes: MockAttributeMap;
}
export declare class MockTextNode extends MockNode {
    constructor(ownerDocument: any, text: string);
    cloneNode(_deep?: boolean): MockTextNode;
    textContent: string;
    data: string;
    readonly wholeText: string;
}
export declare function parseHtmlToDocument(html: string, ownerDocument?: MockDocument): any;
export declare function parseHtmlToFragment(html: string, ownerDocument?: MockDocument): any;
export declare function parseDocumentUtil(ownerDocument: any, html: string): any;
export declare function parseFragmentUtil(ownerDocument: any, html: string): any;
/**
 * https://developer.mozilla.org/en-US/docs/Web/API/Performance
 */
export declare class MockPerformance implements Performance {
    timeOrigin: number;
    constructor();
    addEventListener(): void;
    clearMarks(): void;
    clearMeasures(): void;
    clearResourceTimings(): void;
    dispatchEvent(): boolean;
    getEntries(): any;
    getEntriesByName(): any;
    getEntriesByType(): any;
    mark(): void;
    measure(): void;
    readonly navigation: any;
    now(): number;
    readonly onresourcetimingbufferfull: any;
    removeEventListener(): void;
    setResourceTimingBufferSize(): void;
    readonly timing: any;
    toJSON(): void;
}
export declare function resetPerformance(perf: Performance): void;
export declare function closest(selector: string, elm: MockElement): MockElement;
export declare function matches(selector: string, elm: MockElement): boolean;
export declare function selectOne(selector: string, elm: MockElement): MockElement;
export declare function selectAll(selector: string, elm: MockElement): MockElement[];
export declare function serializeNodeToHtml(elm: Node | MockNode, opts?: SerializeNodeToHtmlOptions): string;
export declare const NON_ESCAPABLE_CONTENT: Set<string>;
export declare const WHITESPACE_SENSITIVE: Set<string>;
export interface SerializeNodeToHtmlOptions {
    approximateLineWidth?: number;
    excludeTagContent?: string[];
    excludeTags?: string[];
    indentSpaces?: number;
    newLines?: boolean;
    outerHtml?: boolean;
    prettyHtml?: boolean;
    removeAttributeQuotes?: boolean;
    removeBooleanAttributeQuotes?: boolean;
    removeEmptyAttributes?: boolean;
    removeHtmlComments?: boolean;
    serializeShadowRoot?: boolean;
}
export declare class MockStorage {
    private items;
    key(_value: number): void;
    getItem(key: string): string;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    clear(): void;
}
/// <reference types="node" />







declare const nativeClearInterval: typeof clearInterval;
declare const nativeClearTimeout: typeof clearTimeout;
declare const nativeSetInterval: typeof setInterval;
declare const nativeSetTimeout: typeof setTimeout;
export declare class MockWindow {
    __timeouts: Set<any>;
    __history: MockHistory;
    __elementCstr: any;
    __htmlElementCstr: any;
    __nodeCstr: any;
    __nodeListCstr: any;
    __localStorage: MockStorage;
    __sessionStorage: MockStorage;
    __location: MockLocation;
    __navigator: MockNavigator;
    __eventClass: any;
    __customEventClass: any;
    __keyboardEventClass: any;
    __mouseEventClass: any;
    __clearInterval: typeof nativeClearInterval;
    __clearTimeout: typeof nativeClearTimeout;
    __setInterval: typeof nativeSetInterval;
    __setTimeout: typeof nativeSetTimeout;
    __maxTimeout: number;
    __allowInterval: boolean;
    URL: typeof URL;
    console: Console;
    customElements: CustomElementRegistry;
    document: Document;
    performance: Performance;
    devicePixelRatio: number;
    innerHeight: number;
    innerWidth: number;
    pageXOffset: number;
    pageYOffset: number;
    screen: Screen;
    screenLeft: number;
    screenTop: number;
    screenX: number;
    screenY: number;
    scrollX: number;
    scrollY: number;
    constructor(html?: string | boolean);
    addEventListener(type: string, handler: (ev?: any) => void): void;
    alert(msg: string): void;
    blur(): any;
    cancelAnimationFrame(id: any): void;
    cancelIdleCallback(id: any): void;
    clearInterval(id: any): void;
    clearTimeout(id: any): void;
    close(): void;
    confirm(): boolean;
    readonly CSS: {
        supports: () => boolean;
    };
    CustomEvent: any;
    dispatchEvent(ev: MockEvent): boolean;
    readonly Element: any;
    Event: any;
    focus(): any;
    getComputedStyle(_: any): any;
    readonly globalThis: this;
    history: any;
    readonly JSON: JSON;
    KeyboardEvent: any;
    readonly HTMLElement: any;
    readonly IntersectionObserver: typeof MockIntersectionObserver;
    localStorage: MockStorage;
    location: Location;
    matchMedia(): {
        matches: boolean;
    };
    MouseEvent: any;
    readonly Node: any;
    readonly NodeList: any;
    navigator: any;
    readonly parent: any;
    prompt(): string;
    open(): any;
    readonly origin: string;
    removeEventListener(type: string, handler: any): void;
    requestAnimationFrame(callback: (timestamp: number) => void): number;
    requestIdleCallback(callback: (deadline: {
        didTimeout: boolean;
        timeRemaining: () => number;
    }) => void): number;
    scroll(_x?: number, _y?: number): void;
    scrollBy(_x?: number, _y?: number): void;
    scrollTo(_x?: number, _y?: number): void;
    readonly self: this;
    sessionStorage: any;
    setInterval(callback: (...args: any[]) => void, ms: number, ...args: any[]): number;
    setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): number;
    readonly top: this;
    readonly window: this;
    onanimationstart(): void;
    onanimationend(): void;
    onanimationiteration(): void;
    onabort(): void;
    onauxclick(): void;
    onbeforecopy(): void;
    onbeforecut(): void;
    onbeforepaste(): void;
    onblur(): void;
    oncancel(): void;
    oncanplay(): void;
    oncanplaythrough(): void;
    onchange(): void;
    onclick(): void;
    onclose(): void;
    oncontextmenu(): void;
    oncopy(): void;
    oncuechange(): void;
    oncut(): void;
    ondblclick(): void;
    ondrag(): void;
    ondragend(): void;
    ondragenter(): void;
    ondragleave(): void;
    ondragover(): void;
    ondragstart(): void;
    ondrop(): void;
    ondurationchange(): void;
    onemptied(): void;
    onended(): void;
    onerror(): void;
    onfocus(): void;
    onformdata(): void;
    onfullscreenchange(): void;
    onfullscreenerror(): void;
    ongotpointercapture(): void;
    oninput(): void;
    oninvalid(): void;
    onkeydown(): void;
    onkeypress(): void;
    onkeyup(): void;
    onload(): void;
    onloadeddata(): void;
    onloadedmetadata(): void;
    onloadstart(): void;
    onlostpointercapture(): void;
    onmousedown(): void;
    onmouseenter(): void;
    onmouseleave(): void;
    onmousemove(): void;
    onmouseout(): void;
    onmouseover(): void;
    onmouseup(): void;
    onmousewheel(): void;
    onpaste(): void;
    onpause(): void;
    onplay(): void;
    onplaying(): void;
    onpointercancel(): void;
    onpointerdown(): void;
    onpointerenter(): void;
    onpointerleave(): void;
    onpointermove(): void;
    onpointerout(): void;
    onpointerover(): void;
    onpointerup(): void;
    onprogress(): void;
    onratechange(): void;
    onreset(): void;
    onresize(): void;
    onscroll(): void;
    onsearch(): void;
    onseeked(): void;
    onseeking(): void;
    onselect(): void;
    onselectstart(): void;
    onstalled(): void;
    onsubmit(): void;
    onsuspend(): void;
    ontimeupdate(): void;
    ontoggle(): void;
    onvolumechange(): void;
    onwaiting(): void;
    onwebkitfullscreenchange(): void;
    onwebkitfullscreenerror(): void;
    onwheel(): void;
}
export declare function createWindow(html?: string | boolean): Window;
export declare function cloneWindow(srcWin: Window): MockWindow;
export declare function cloneDocument(srcDoc: Document): Document;
/**
 * Constrain setTimeout() to 1ms, but still async. Also
 * only allow setInterval() to fire once, also constrained to 1ms.
 */
export declare function constrainTimeouts(win: any): void;
export {};