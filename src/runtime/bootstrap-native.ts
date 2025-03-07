import * as d from '../declarations';
import { registerHost, supportsShadowDom } from '@platform';
import { BUILD } from '@app-data';
import { CMP_FLAGS } from '@utils';
import { connectedCallback } from './connected-callback';
import { disconnectedCallback } from './disconnected-callback';
import { proxyComponent } from './proxy-component';
import { PROXY_FLAGS } from './runtime-constants';

export const attachShadow = (el: HTMLElement) => {
  if (supportsShadowDom) {
    el.attachShadow({ mode: 'open' });
  } else {
    (el as any).shadowRoot = el;
  }
};

export const proxyNative = (Cstr: any, compactMeta: d.ComponentRuntimeMetaCompact) => {
  const cmpMeta: d.ComponentRuntimeMeta = {
    $flags$: compactMeta[0],
    $tagName$: compactMeta[1],
    $members$: compactMeta[2],
    $listeners$: compactMeta[3],
    $watchers$: Cstr.$watchers$
  };
  if (BUILD.reflect) {
    cmpMeta.$attrsToReflect$ = [];
  }
  if (BUILD.shadowDom && !supportsShadowDom && cmpMeta.$flags$ & CMP_FLAGS.shadowDomEncapsulation) {
    cmpMeta.$flags$ |= CMP_FLAGS.needsShadowDomShim;
  }

  Object.assign(Cstr.prototype, {
    __registerHost() {
      registerHost(this, cmpMeta);
    },
    connectedCallback() {
      connectedCallback(this);
    },
    disconnectedCallback() {
      disconnectedCallback(this);
    }
  });
  return proxyComponent(Cstr, cmpMeta, PROXY_FLAGS.isElementConstructor | PROXY_FLAGS.proxyState);
};
