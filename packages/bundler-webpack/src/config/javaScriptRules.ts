import { chalk, lodash, resolve } from "@umajs/utils";
import { dirname, isAbsolute } from 'path';
import Config from '../../compiled/webpack-5-chain';
import { Env, IConfig, Transpiler } from "../types";
import { es5ImcompatibleVersionsToPkg, isMatch } from '../utils/depMatch';

interface IOpts {
  config: Config;
  userConfig: IConfig;
  cwd: string;
  env: Env;
  extraBabelPlugins: any[];
  extraBabelPresets: any[];
  extraBabelIncludes: Array<string | RegExp>;
  extraEsbuildLoaderHandler: any[];
  babelPreset: any;
  name?: string;
}

export async function addJavaScriptRules(opts: IOpts) {
  const { config, userConfig, cwd } = opts;
  // const isDev = opts.env === Env.development;

  const depPkgs = Object.assign({}, es5ImcompatibleVersionsToPkg());

  const srcRules = [
      config.module
          .rule("src")
          .test(/\.(js|mjs|cjs)$/)
          .include.add([
              cwd,
              ...(process.env.APP_ROOT ? [process.cwd()] : []),
          ])
          .end()
          .exclude
          .add(/node_modules/)
          .end(),
      config.module.rule('jsx-ts-tsx').test(/\.(jsx|ts|tsx)$/),
      config.module
          .rule('extra-src')
          .test(/\.(js|mjs|cjs)$/)
          .include.add([
              ...opts.extraBabelIncludes.map((p) => {
                // regexp
                if (lodash.isRegExp(p)) {
                  return p;
                }

                // handle absolute path
                if (isAbsolute(p)) {
                  return p;
                }
                try {
                  if (p.startsWith('./')) {
                    return require.resolve(p, { paths: [cwd] });
                  }
                  return dirname(
                      resolve.sync(`${p}/package.json`, {
                        basedir: cwd,
                        // same behavior as webpack, to ensure `include` paths matched
                        // ref: https://webpack.js.org/configuration/resolve/#resolvesymlinks
                        preserveSymlinks: false,
                      }),
                  );
                }
                catch (e: any) {
                  if (e.code === 'MODULE_NOT_FOUND') {
                    throw new Error('Cannot resolve extraBabelIncludes: ' + p, {
                      cause: e,
                    });
                  }
                  throw e;
                }
              }),
              // support es5ImcompatibleVersions
              (path: string) => {
                try {
                  // do src transform for bundler-webpack/client/client/client.js
                  if (path.includes('client/client/client')) return true;
                  return isMatch({ path, pkgs: depPkgs });
                } catch (e) {
                  console.error(chalk.red(e));
                  throw e;
                }
              },
          ])
          .end()
  ] as Config.Rule<Config.Module>[];

  const depRules = [
    config.module
        .rule('dep')
        .test(/\.(js|mjs|cjs)$/)
        .include.add(/node_modules/)
        .end()
        .exclude.add((path: string) => {
          try {
            return isMatch({ path, pkgs: depPkgs });
          } catch (e) {
            console.error(chalk.red(e));
            throw e;
          }
        })
        .end(),
  ];
  srcRules
      .concat(depRules)
      .forEach((rule) => rule.resolve.set('fullySpecified', false));

  const srcTranspiler = userConfig.srcTranspiler || Transpiler.babel;

  srcRules.forEach((rule) => {
    if(srcTranspiler === Transpiler.babel){
      rule.use("babel-loader")
          .loader(require.resolve('../../compiled/babel-loader'))
          .options({
            sourceType: 'unambiguous',
            babelrc: false,
            configFile: false,
            cacheDirectory: false,
            browserslistConfigFile: false,
            targets: userConfig.targets,
            // 解决 vue MFSU 解析 需要
            customize: userConfig.babelLoaderCustomize,
            presets: [
             /* opts.babelPreset || [
                require.resolve('@umijs/babel-preset-umi'),
                {
                  presetEnv: {},
                  presetReact: {},
                  presetTypeScript: {},
                  pluginTransformRuntime: {},
                  pluginLockCoreJS: {},
                  pluginDynamicImportNode: false,
                  pluginAutoCSSModules: userConfig.autoCSSModules,
                },
              ],*/
              ...opts.extraBabelPresets,
              ...(userConfig.extraBabelPresets || []).filter(Boolean),
            ],
            plugins: [
              // useFastRefresh && require.resolve('react-refresh/babel'),
              ...opts.extraBabelPlugins,
              ...(userConfig.extraBabelPlugins || []),
            ].filter(Boolean),
          })
    }
    else if(srcTranspiler === Transpiler.swc){
      rule
          .use("swc-loader")
          .loader(require.resolve("../loader/swc"))
          .options({
            /*excludeFiles: [
              // exclude MFSU virtual entry files, because swc not support top level await
              new RegExp(`/${VIRTUAL_ENTRY_DIR}/[^\\/]+\\.js$`),
            ],*/
            enableAutoCssModulesPlugin: userConfig.autoCSSModules,
            mergeConfigs: userConfig.srcTranspilerOptions?.swc,
          })
    }
  });

  const depTranspiler = userConfig.depTranspiler || Transpiler.none;

  depRules.forEach((_rule) => {
    if (depTranspiler === Transpiler.none) {
      // noop
    } else {
      throw new Error(`Unsupported depTranspiler ${depTranspiler}.`);
    }
  });
}