import { parsePropertyValue, getValue, setValue, insertVdomAnnotations, connectedCallback } from '@stencil/core/runtime';
export * from '@stencil/core/runtime';

function proxyHostElement(elm, cmpMeta) {
    if (typeof elm.componentOnReady !== 'function') {
        elm.componentOnReady = componentOnReady;
    }
    if (typeof elm.forceUpdate !== 'function') {
        elm.forceUpdate = forceUpdate;
    }
    if (cmpMeta.$members$ != null) {
        const hostRef = getHostRef(elm);
        const members = Object.entries(cmpMeta.$members$);
        members.forEach(([memberName, m]) => {
            const memberFlags = m[0];
            if (memberFlags & 31) {
                const attributeName = (m[1] || memberName);
                const attrValue = elm.getAttribute(attributeName);
                if (attrValue != null) {
                    const parsedAttrValue = parsePropertyValue(attrValue, memberFlags);
                    hostRef.$instanceValues$.set(memberName, parsedAttrValue);
                }
                const ownValue = elm[memberName];
                if (ownValue !== undefined) {
                    hostRef.$instanceValues$.set(memberName, ownValue);
                    delete elm[memberName];
                }
                Object.defineProperty(elm, memberName, {
                    get() {
                        return getValue(this, memberName);
                    },
                    set(newValue) {
                        setValue(this, memberName, newValue, cmpMeta);
                    },
                    configurable: true,
                    enumerable: true
                });
            }
            else if (memberFlags & 64) {
                Object.defineProperty(elm, memberName, {
                    value() {
                        const ref = getHostRef(this);
                        const args = arguments;
                        return ref.$onInstancePromise$.then(() => ref.$lazyInstance$[memberName].apply(ref.$lazyInstance$, args)).catch(consoleError);
                    }
                });
            }
        });
    }
}
function componentOnReady() {
    return getHostRef(this).$onReadyPromise$;
}
function forceUpdate() { }

function bootstrapHydrate(win, opts, done) {
    const results = {
        hydratedCount: 0,
        hydratedComponents: []
    };
    plt.$resourcesUrl$ = new URL(opts.resourcesUrl || './', doc.baseURI).href;
    try {
        const connectedElements = new Set();
        const createdElements = new Set();
        const patchedConnectedCallback = function patchedConnectedCallback() {
            return connectElement(this);
        };
        const patchElement = function (elm) {
            const tagName = elm.nodeName.toLowerCase();
            if (elm.tagName.includes('-')) {
                const Cstr = getComponent(tagName);
                if (Cstr != null && Cstr.cmpMeta) {
                    createdElements.add(elm);
                    elm.connectedCallback = patchedConnectedCallback;
                    registerHost(elm);
                    proxyHostElement(elm, Cstr.cmpMeta);
                }
            }
        };
        const orgDocumentCreateElement = win.document.createElement;
        win.document.createElement = function patchedCreateElement(tagName) {
            const elm = orgDocumentCreateElement.call(win.document, tagName);
            patchElement(elm);
            return elm;
        };
        const orgDocumentCreateElementNS = win.document.createElementNS;
        win.document.createElementNS = function patchedCreateElement(namespaceURI, tagName) {
            const elm = orgDocumentCreateElementNS.call(win.document, namespaceURI, tagName);
            patchElement(elm);
            return elm;
        };
        const patchChild = (elm) => {
            if (elm != null && elm.nodeType === 1) {
                patchElement(elm);
                const children = elm.children;
                for (let i = 0, ii = children.length; i < ii; i++) {
                    patchChild(children[i]);
                }
            }
        };
        const connectElement = (elm) => {
            createdElements.delete(elm);
            if (elm != null && elm.nodeType === 1 && results.hydratedCount < opts.maxHydrateCount && shouldHydrate(elm)) {
                const tagName = elm.nodeName.toLowerCase();
                if (tagName.includes('-') && !connectedElements.has(elm)) {
                    connectedElements.add(elm);
                    return hydrateComponent(win, results, tagName, elm);
                }
            }
            return Promise.resolve();
        };
        const flush = () => {
            const toConnect = Array.from(createdElements).filter(elm => elm.parentElement);
            if (toConnect.length > 0) {
                return Promise.all(toConnect.map(elm => connectElement(elm)));
            }
            return undefined;
        };
        patchChild(win.document.body);
        const waitLoop = () => {
            const waitForComponents = flush();
            if (waitForComponents === undefined) {
                return Promise.resolve();
            }
            return waitForComponents.then(() => waitLoop());
        };
        waitLoop()
            .then(() => {
            try {
                createdElements.clear();
                connectedElements.clear();
                if (opts.clientHydrateAnnotations) {
                    insertVdomAnnotations(win.document);
                }
                win.document.createElement = orgDocumentCreateElement;
                win.document.createElementNS = orgDocumentCreateElementNS;
            }
            catch (e) {
                win.console.error(e);
            }
            done(results);
        })
            .catch(e => {
            try {
                win.console.error(e);
                connectedElements.clear();
                win.document.createElement = orgDocumentCreateElement;
                win.document.createElementNS = orgDocumentCreateElementNS;
            }
            catch (e) { }
            done(results);
        });
    }
    catch (e) {
        win.console.error(e);
        win = opts = null;
        done(results);
    }
}
async function hydrateComponent(win, results, tagName, elm) {
    const Cstr = getComponent(tagName);
    if (Cstr != null) {
        const cmpMeta = Cstr.cmpMeta;
        if (cmpMeta != null) {
            try {
                connectedCallback(elm, cmpMeta);
                await elm.componentOnReady();
                results.hydratedCount++;
                const ref = getHostRef(elm);
                const modeName = !ref.$modeName$ ? '$' : ref.$modeName$;
                if (!results.hydratedComponents.some(c => c.tag === tagName && c.mode === modeName)) {
                    results.hydratedComponents.push({
                        tag: tagName,
                        mode: modeName
                    });
                }
            }
            catch (e) {
                win.console.error(e);
            }
        }
    }
}
function shouldHydrate(elm) {
    if (elm.nodeType === 9) {
        return true;
    }
    if (NO_HYDRATE_TAGS.has(elm.nodeName)) {
        return false;
    }
    if (elm.hasAttribute('no-prerender')) {
        return false;
    }
    const parentNode = elm.parentNode;
    if (parentNode == null) {
        return true;
    }
    return shouldHydrate(parentNode);
}
const NO_HYDRATE_TAGS = new Set([
    'CODE',
    'HEAD',
    'IFRAME',
    'INPUT',
    'OBJECT',
    'OUTPUT',
    'NOSCRIPT',
    'PRE',
    'SCRIPT',
    'SELECT',
    'STYLE',
    'TEMPLATE',
    'TEXTAREA'
]);

const cstrs = new Map();
const loadModule = (cmpMeta, _hostRef, _hmrVersionId) => {
    return cstrs.get(cmpMeta.$tagName$);
};
const getComponent = (tagName) => {
    return cstrs.get(tagName);
};
const isMemberInElement = (elm, memberName) => {
    if (elm != null) {
        if (memberName in elm) {
            return true;
        }
        const nodeName = elm.nodeName;
        if (nodeName) {
            const hostRef = getComponent(nodeName.toLowerCase());
            if (hostRef != null && hostRef.cmpMeta != null && hostRef.cmpMeta.$members$ != null) {
                return memberName in hostRef.cmpMeta.$members$;
            }
        }
    }
    return false;
};
const registerComponents = (Cstrs) => {
    Cstrs.forEach(Cstr => {
        cstrs.set(Cstr.cmpMeta.$tagName$, Cstr);
    });
};
const win = window;
const doc = win.document;
const readTask = (cb) => {
    process.nextTick(() => {
        try {
            cb();
        }
        catch (e) {
            consoleError(e);
        }
    });
};
const writeTask = (cb) => {
    process.nextTick(() => {
        try {
            cb();
        }
        catch (e) {
            consoleError(e);
        }
    });
};
const nextTick = (cb) => Promise.resolve().then(cb);
const consoleError = (e) => {
    if (e != null) {
        console.error(e.stack || e.message || e);
    }
};
const Context = {};
const plt = {
    $flags$: 0,
    $resourcesUrl$: '',
    jmp: (h) => h(),
    raf: (h) => requestAnimationFrame(h),
    ael: (el, eventName, listener, opts) => el.addEventListener(eventName, listener, opts),
    rel: (el, eventName, listener, opts) => el.removeEventListener(eventName, listener, opts),
};
const supportsShadowDom = false;
const supportsListenerOptions = false;
const supportsConstructibleStylesheets = false;
const hostRefs = new WeakMap();
const getHostRef = (ref) => hostRefs.get(ref);
const registerInstance = (lazyInstance, hostRef) => hostRefs.set(hostRef.$lazyInstance$ = lazyInstance, hostRef);
const registerHost = (elm) => {
    const hostRef = {
        $flags$: 0,
        $hostElement$: elm,
        $instanceValues$: new Map(),
        $renderCount$: 0
    };
    hostRef.$onInstancePromise$ = new Promise(r => hostRef.$onInstanceResolve$ = r);
    hostRef.$onReadyPromise$ = new Promise(r => hostRef.$onReadyResolve$ = r);
    elm['s-p'] = [];
    elm['s-rc'] = [];
    return hostRefs.set(elm, hostRef);
};
const Build = {
    isDev: false,
    isBrowser: false
};
const styles = new Map();

export { Build, Context, bootstrapHydrate, consoleError, doc, getComponent, getHostRef, isMemberInElement, loadModule, nextTick, plt, readTask, registerComponents, registerHost, registerInstance, styles, supportsConstructibleStylesheets, supportsListenerOptions, supportsShadowDom, win, writeTask };
