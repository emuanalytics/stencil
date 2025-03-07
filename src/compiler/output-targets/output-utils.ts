import * as d from '../../declarations';
import { flatOne, sortBy } from '@utils';


export const getDistEsmDir = (config: d.Config, outputTarget: d.OutputTargetDist, sourceTarget?: d.SourceTarget) =>
  config.sys.path.join(outputTarget.buildDir, 'esm', sourceTarget || '');

export const getDistEsmComponentsDir = (config: d.Config, outputTarget: d.OutputTargetDist, sourceTarget: d.SourceTarget) =>
  config.sys.path.join(getDistEsmDir(config, outputTarget, sourceTarget), 'build');

export const getDistEsmIndexPath = (config: d.Config, outputTarget: d.OutputTargetDist, sourceTarget?: d.SourceTarget) =>
  config.sys.path.join(getDistEsmDir(config, outputTarget, sourceTarget), 'index.js');

export const getDefineCustomElementsPath = (config: d.Config, outputTarget: d.OutputTargetDist, sourceTarget: d.SourceTarget) =>
  config.sys.path.join(getDistEsmDir(config, outputTarget, sourceTarget), getDefineEsmFilename(config));

export const getComponentsEsmBuildPath = (config: d.Config, outputTarget: d.OutputTargetDist, sourceTarget: d.SourceTarget) =>
  config.sys.path.join(getDistEsmDir(config, outputTarget, sourceTarget), getComponentsEsmFileName(config));

export const getCoreEsmFileName = (config: d.Config) =>
  `${config.fsNamespace}.core.js`;

export const getDefineEsmFilename = (config: d.Config) =>
  `${config.fsNamespace}.define.js`;

export const getComponentsEsmFileName = (config: d.Config) =>
  `${config.fsNamespace}.components.js`;

export const getLoaderEsmPath = (config: d.Config, outputTarget: d.OutputTargetDist) =>
  config.sys.path.join(outputTarget.buildDir, outputTarget.esmLoaderPath);

export const getComponentsDtsSrcFilePath = (config: d.Config) =>
  config.sys.path.join(config.srcDir, GENERATED_DTS);

export const getComponentsDtsTypesFilePath = (config: d.Config, outputTarget: d.OutputTargetDist | d.OutputTargetDistTypes) =>
  config.sys.path.join(outputTarget.typesDir, GENERATED_DTS);

export const isOutputTargetDist = (o: d.OutputTarget): o is d.OutputTargetDist =>
  o.type === DIST;

export const isOutputTargetDistCollection = (o: d.OutputTarget): o is d.OutputTargetDistCollection =>
  o.type === DIST_COLLECTION;

export const isOutputTargetDistCustomElements = (o: d.OutputTarget): o is d.OutputTargetDistCustomElements =>
  o.type === DIST_CUSTOM_ELEMENTS;

export const isOutputTargetDistCustomElementsBundle = (o: d.OutputTarget): o is d.OutputTargetDistCustomElements =>
  o.type === DIST_CUSTOM_ELEMENTS_BUNDLE;

export const isOutputTargetCopy = (o: d.OutputTarget): o is d.OutputTargetCopy =>
  o.type === COPY;

export const isOutputTargetDistLazy = (o: d.OutputTarget): o is d.OutputTargetDistLazy =>
  o.type === DIST_LAZY;

export const isOutputTargetAngular = (o: d.OutputTarget): o is d.OutputTargetAngular =>
  o.type === ANGULAR;

export const isOutputTargetDistLazyLoader = (o: d.OutputTarget): o is d.OutputTargetDistLazyLoader =>
  o.type === DIST_LAZY_LOADER;

export const isOutputTargetDistGlobalStyles = (o: d.OutputTarget): o is d.OutputTargetDistGlobalStyles =>
  o.type === DIST_GLOBAL_STYLES;

export const isOutputTargetDistSelfContained = (o: d.OutputTarget): o is d.OutputTargetDistSelfContained =>
  o.type === DIST_SELF_CONTAINED;

export const isOutputTargetHydrate = (o: d.OutputTarget): o is d.OutputTargetHydrate =>
  o.type === DIST_HYDRATE_SCRIPT;

export const isOutputTargetCustom = (o: d.OutputTarget): o is d.OutputTargetCustom =>
  o.type === CUSTOM;

export const isOutputTargetDocs = (o: d.OutputTarget): o is (d.OutputTargetDocsJson | d.OutputTargetDocsReadme | d.OutputTargetDocsVscode | d.OutputTargetDocsCustom) =>
  o.type === DOCS || o.type === DOCS_README || o.type === DOCS_JSON || o.type === DOCS_CUSTOM || o.type === DOCS_VSCODE;

export const isOutputTargetDocsReadme = (o: d.OutputTarget): o is d.OutputTargetDocsReadme =>
  o.type === DOCS_README || o.type === DOCS;

export const isOutputTargetDocsJson = (o: d.OutputTarget): o is d.OutputTargetDocsJson =>
  o.type === DOCS_JSON;

export const isOutputTargetDocsCustom = (o: d.OutputTarget): o is d.OutputTargetDocsCustom =>
  o.type === DOCS_CUSTOM;

export const isOutputTargetDocsVscode = (o: d.OutputTarget): o is d.OutputTargetDocsVscode =>
  o.type === DOCS_VSCODE;

export const isOutputTargetWww = (o: d.OutputTarget): o is d.OutputTargetWww =>
  o.type === WWW;

export const isOutputTargetStats = (o: d.OutputTarget): o is d.OutputTargetStats =>
  o.type === STATS;

export const isOutputTargetDistTypes = (o: d.OutputTarget): o is d.OutputTargetDistTypes =>
  o.type === DIST_TYPES;

export const getComponentsFromModules = (moduleFiles: d.Module[]) =>
  sortBy(flatOne(moduleFiles.map(m => m.cmps)), (c: d.ComponentCompilerMeta) => c.tagName);

export const canSkipOutputTargets = (buildCtx: d.BuildCtx) => {
  if (buildCtx.components.length === 0) {
    return true;
  }
  if (buildCtx.requiresFullBuild) {
    return false;
  }
  if (buildCtx.isRebuild && (buildCtx.hasScriptChanges || buildCtx.hasStyleChanges || buildCtx.hasHtmlChanges)) {
    return false;
  }
  return true;
};

export const ANGULAR = `angular`;
export const COPY = 'copy';
export const CUSTOM = `custom`;
export const DIST = `dist`;
export const DIST_COLLECTION = `dist-collection`;
export const DIST_CUSTOM_ELEMENTS = `dist-custom-elements`;
export const DIST_CUSTOM_ELEMENTS_BUNDLE = `experimental-dist-module`;
export const DIST_TYPES = `dist-types`;
export const DIST_HYDRATE_SCRIPT = `dist-hydrate-script`;
export const DIST_LAZY = `dist-lazy`;
export const DIST_LAZY_LOADER = `dist-lazy-loader`;
export const DIST_SELF_CONTAINED = `dist-self-contained`;
export const DIST_GLOBAL_STYLES = 'dist-global-styles';
export const DOCS = `docs`;
export const DOCS_CUSTOM = 'docs-custom';
export const DOCS_JSON = `docs-json`;
export const DOCS_README = `docs-readme`;
export const DOCS_VSCODE = `docs-vscode`;
export const STATS = `stats`;
export const WWW = `www`;


export const VALID_TYPES = [
  ANGULAR,
  COPY,
  CUSTOM,
  DIST,
  DIST_COLLECTION,
  DIST_CUSTOM_ELEMENTS,
  DIST_GLOBAL_STYLES,
  DIST_HYDRATE_SCRIPT,
  DIST_LAZY,
  DIST_SELF_CONTAINED,
  DOCS,
  DOCS_JSON,
  DOCS_README,
  DOCS_VSCODE,
  DOCS_CUSTOM,
  STATS,
  WWW,
];

export const VALID_TYPES_NEXT = [
  // DIST
  WWW,
  DIST,
  DIST_COLLECTION,
  DIST_CUSTOM_ELEMENTS,
  DIST_CUSTOM_ELEMENTS_BUNDLE,
  DIST_LAZY,
  DIST_HYDRATE_SCRIPT,

  // DOCS
  DOCS,
  DOCS_JSON,
  DOCS_README,
  DOCS_VSCODE,
  DOCS_CUSTOM,

  // MISC
  ANGULAR,
  COPY,
  CUSTOM,
  STATS,

];

export const GENERATED_DTS = 'components.d.ts';
