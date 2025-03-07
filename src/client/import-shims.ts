import * as d from '../declarations';
import { BUILD, NAMESPACE } from '@app-data';
import { consoleDevInfo } from './client-log';
import { doc, plt, win } from './client-window';
import { getDynamicImportFunction } from '@utils';


export const patchEsm = () => {
  // @ts-ignore
  if (BUILD.cssVarShim && !(win.CSS && win.CSS.supports && win.CSS.supports('color', 'var(--c)'))) {
    // @ts-ignore
    return import('./polyfills/css-shim.js').then(() => {
      plt.$cssShim$ = (win as any).__stencil_cssshim;
      if (plt.$cssShim$) {
        return plt.$cssShim$.initShim();
      }
    });
  }
  return Promise.resolve();
};

export const patchBrowser = async (): Promise<d.CustomElementsDefineOptions> => {
  if (BUILD.isDev) {
    consoleDevInfo('Running in development mode.');
  }
  if (BUILD.cssVarShim) {
    plt.$cssShim$ = (win as any).__stencil_cssshim;
  }

  // @ts-ignore
  const importMeta = import.meta.url;
  const regex = new RegExp(`\/${NAMESPACE}(\\.esm)?\\.js($|\\?|#)`);
  const scriptElm = Array.from(doc.querySelectorAll('script')).find(s => (
    regex.test(s.src) ||
    s.getAttribute('data-stencil-namespace') === NAMESPACE
  ));
  const opts = (scriptElm as any)['data-opts'];
  if (importMeta !== '') {
    return {
      ...opts,
      resourcesUrl: new URL('.', importMeta).href
    };
  } else {
    const resourcesUrl = new URL('.', new URL(scriptElm.getAttribute('data-resources-url') || scriptElm.src, win.location.href));
    patchDynamicImport(resourcesUrl.href);

    if (!window.customElements) {
      // @ts-ignore
      await import('./polyfills/dom.js');
    }
    return {
      ...opts,
      resourcesUrl: resourcesUrl.href,
    };
  }
};

export const patchDynamicImport = (base: string) => {
  const importFunctionName = getDynamicImportFunction(NAMESPACE);
  try {
    // There is a caching issue in V8, that breaks using import() in Function
    // By generating a random string, we can workaround it
    // Check https://bugs.chromium.org/p/chromium/issues/detail?id=990810 for more info
    (win as any)[importFunctionName] = new Function('w', `return import(w);//${Math.random()}`);
  } catch (e) {
    const moduleMap = new Map<string, any>();
    (win as any)[importFunctionName] = (src: string) => {
      const url = new URL(src, base).href;
      let mod = moduleMap.get(url);
      if (!mod) {
        const script = doc.createElement('script');
        script.type = 'module';
        script.src = URL.createObjectURL(new Blob([`import * as m from '${url}'; window.${importFunctionName}.m = m;`], { type: 'application/javascript' }));
        mod = new Promise(resolve => {
          script.onload = () => {
            resolve((win as any)[importFunctionName].m);
            script.remove();
          };
        });
        moduleMap.set(url, mod);
        doc.head.appendChild(script);
      }
      return mod;
    };
  }
};

