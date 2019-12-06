import * as d from '../../declarations';
export declare function outputAngular(config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx): Promise<void>;
export declare function angularDirectiveProxyOutput(config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx, outputTarget: d.OutputTargetAngular): Promise<[d.FsWriteResults, any, void]>;
export declare const GENERATED_DTS = "components.d.ts";
