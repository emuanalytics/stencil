import { ComponentCompilerMeta } from './component-compiler-meta';


export interface EntryModule {
  entryKey: string;
  cmps: ComponentCompilerMeta[];
  modeNames: string[];
}

export interface EntryBundle {
  fileName: string;
  text: string;
  outputs: string[];
  modeName: string;
  isScopedStyles: boolean;
  sourceTarget: string;
}

export interface EntryComponent {
  tag: string;
  dependencyOf?: string[];
}

export interface ComponentRef {
  tag: string;
  filePath: string;
}

export interface ModuleGraph {
  filePath: string;
  importPaths: string[];
}
