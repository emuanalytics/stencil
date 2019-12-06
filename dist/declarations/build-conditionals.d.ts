export interface BuildFeatures {
    style: boolean;
    mode: boolean;
    shadowDom: boolean;
    scoped: boolean;
    /**
     * Every component has a render function
     */
    allRenderFn: boolean;
    /**
     * At least one component has a render function
     */
    hasRenderFn: boolean;
    vdomRender: boolean;
    noVdomRender: boolean;
    vdomAttribute: boolean;
    vdomXlink: boolean;
    vdomClass: boolean;
    vdomStyle: boolean;
    vdomKey: boolean;
    vdomRef: boolean;
    vdomListener: boolean;
    vdomFunctional: boolean;
    vdomText: boolean;
    slotRelocation: boolean;
    slot: boolean;
    svg: boolean;
    element: boolean;
    event: boolean;
    hostListener: boolean;
    hostListenerTargetWindow: boolean;
    hostListenerTargetDocument: boolean;
    hostListenerTargetBody: boolean;
    hostListenerTargetParent: boolean;
    hostListenerTarget: boolean;
    method: boolean;
    prop: boolean;
    propMutable: boolean;
    state: boolean;
    watchCallback: boolean;
    member: boolean;
    updatable: boolean;
    propBoolean: boolean;
    propNumber: boolean;
    propString: boolean;
    lifecycle: boolean;
    cmpDidLoad: boolean;
    cmpShouldUpdate: boolean;
    cmpWillLoad: boolean;
    cmpDidUpdate: boolean;
    cmpWillUpdate: boolean;
    cmpWillRender: boolean;
    cmpDidRender: boolean;
    cmpDidUnload: boolean;
    connectedCallback: boolean;
    disconnectedCallback: boolean;
    asyncLoading: boolean;
    observeAttribute: boolean;
    reflect: boolean;
    taskQueue: boolean;
}
export interface Build extends Partial<BuildFeatures> {
    hotModuleReplacement?: boolean;
    isDebug?: boolean;
    isDev?: boolean;
    devTools?: boolean;
    hydrateServerSide?: boolean;
    hydrateClientSide?: boolean;
    lifecycleDOMEvents?: boolean;
    cssAnnotations?: boolean;
    lazyLoad?: boolean;
    profile?: boolean;
    cssVarShim?: boolean;
    constructableCSS?: boolean;
    initializeNextTick?: boolean;
}
export interface UserBuildConditionals {
    readonly isDev: boolean;
    readonly isBrowser: boolean;
}
