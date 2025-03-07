import * as d from '../../declarations';
import { getBuildTimestamp } from '../../compiler/build/build-ctx';
import { hasError, isString, normalizeDiagnostics } from '@utils';


export const generateBuildResults = (compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx) => {
  const buildResults: d.CompilerBuildResults = {
    buildId: buildCtx.buildId,
    diagnostics: normalizeDiagnostics(compilerCtx, buildCtx.diagnostics),
    dirsAdded: buildCtx.dirsAdded.slice().sort(),
    dirsDeleted: buildCtx.dirsDeleted.slice().sort(),
    duration: Date.now() - buildCtx.startTime,
    filesAdded: buildCtx.filesAdded.slice().sort(),
    filesChanged: buildCtx.filesChanged.slice().sort(),
    filesDeleted: buildCtx.filesDeleted.slice().sort(),
    filesUpdated: buildCtx.filesUpdated.slice().sort(),
    hasError: hasError(buildCtx.diagnostics),
    hasSuccessfulBuild: compilerCtx.hasSuccessfulBuild,
    isRebuild: buildCtx.isRebuild,
    outputs: compilerCtx.fs.getBuildOutputs(),
    timestamp: getBuildTimestamp(),
  };

  if (isString(buildCtx.hydrateAppFilePath)) {
    buildResults.hydrateAppFilePath = buildCtx.hydrateAppFilePath;
  }

  compilerCtx.lastBuildResults = Object.assign({}, buildResults as any);

  return buildResults;
};
