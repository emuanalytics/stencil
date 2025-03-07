import * as d from '../../../declarations';
import { generateLazyModules } from '../dist-lazy/generate-lazy-module';
import { generateRollupOutput } from '../../../compiler/app-core/bundle-app-core';
import { OutputOptions, RollupBuild } from 'rollup';
import { relativeImport } from '@utils';
import { RollupResult } from '../../../declarations';


export const generateEsm = async (config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx, rollupBuild: RollupBuild, outputTargets: d.OutputTargetDistLazy[]) => {
  const esmEs5Outputs = config.buildEs5 ? outputTargets.filter(o => !!o.esmEs5Dir && !o.isBrowserBuild) : [];
  const esmOutputs = outputTargets.filter(o => !!o.esmDir && !o.isBrowserBuild);
  if (esmOutputs.length + esmEs5Outputs.length > 0) {
    const esmOpts: OutputOptions = {
      format: 'es',
      entryFileNames: '[name].mjs',
      preferConst: true
    };
    const outputTargetType = esmOutputs[0].type;
    const output = await generateRollupOutput(rollupBuild, esmOpts, config, buildCtx.entryModules);
    if (output != null) {
      const es2017destinations = esmOutputs.map(o => o.esmDir);
      await generateLazyModules(config, compilerCtx, buildCtx, outputTargetType, es2017destinations, output, 'es2017', false, '');

      const es5destinations = esmEs5Outputs.map(o => o.esmEs5Dir);
      await generateLazyModules(config, compilerCtx, buildCtx, outputTargetType, es5destinations, output, 'es5', false, '');

      await copyPolyfills(config, compilerCtx, esmOutputs);
      await generateShortcuts(config, compilerCtx, outputTargets, output);
    }
  }
};

const copyPolyfills = async (config: d.Config, compilerCtx: d.CompilerCtx, outputTargets: d.OutputTargetDistLazy[]) => {
  const destinations = outputTargets.filter(o => o.polyfills).map(o => o.esmDir);
  if (destinations.length === 0) {
    return;
  }

  const src = config.sys.path.join(config.sys.compiler.packageDir, 'internal', 'client', 'polyfills');
  const files = await compilerCtx.fs.readdir(src);

  await Promise.all(destinations.map(dest => {
    return Promise.all(files.map(f => {
      return compilerCtx.fs.copyFile(
        f.absPath,
        config.sys.path.join(dest, 'polyfills', f.relPath));
    }));
  }));
};

const generateShortcuts = (config: d.Config, compilerCtx: d.CompilerCtx, outputTargets: d.OutputTargetDistLazy[], rollupResult: RollupResult[]) => {
  const indexFilename = rollupResult.find(r => r.isIndex).fileName;

  return Promise.all(
    outputTargets.map(async o => {
      if (o.esmDir && o.esmIndexFile) {
        const entryPointPath = config.buildEs5 && o.esmEs5Dir
          ? config.sys.path.join(o.esmEs5Dir, indexFilename)
          : config.sys.path.join(o.esmDir, indexFilename);

        const relativePath = relativeImport(config, o.esmIndexFile, entryPointPath);
        const shortcutContent = `export * from '${relativePath}';`;
        await compilerCtx.fs.writeFile(o.esmIndexFile, shortcutContent, { outputTargetType: o.type });
      }
    })
  );
};
