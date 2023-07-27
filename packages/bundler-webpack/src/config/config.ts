import webpack, { Configuration } from '../../compiled/webpack';
import { Env, IConfig } from '../types';
import Config from '../../compiled/webpack-5-chain';
import {DEFAULT_BROWSER_TARGETS, DEFAULT_DEVTOOL, DEFAULT_OUTPUT_PATH} from "../constants";
import {getBrowsersList} from "../utils/browsersList";
import {resolve} from "path";
import {addJavaScriptRules} from "./javaScriptRules";
import {addCSSRules} from "./cssRules";

export interface IOpts {
  cwd: string;
  rootDir?: string;
  env: Env;
  entry: Record<string, string>;
  extraBabelPresets?: any[];
  extraBabelPlugins?: any[];
  extraBabelIncludes?: Array<string | RegExp>;
  extraEsbuildLoaderHandler?: any[];
  babelPreset?: any;
  chainWebpack?: Function;
  modifyWebpackConfig?: Function;
  hash?: boolean;
  hmr?: boolean;
  staticPathPrefix?: string;
  userConfig: IConfig;
  analyze?: any;
  name?: string;
  cache?: {
    absNodeModulesPath?: string;
    buildDependencies?: string[];
    cacheDirectory?: string;
  };
  pkg?: Record<string, any>;
  disableCopy?: boolean;
}

export async function getConfig(opts: IOpts): Promise<Configuration>{
  const { userConfig } = opts;
  const isDev = opts.env === Env.development;
  const config = new Config();
  userConfig.targets ||= DEFAULT_BROWSER_TARGETS;
  // normalize inline limit
  userConfig.inlineLimit = parseInt(userConfig.inlineLimit || '10000', 10);
  const useHash = !!(opts.hash || (userConfig.hash && !isDev));
  const applyOpts = {
    name: opts.name,
    config,
    userConfig,
    cwd: opts.cwd,
    env: opts.env,
    babelPreset: opts.babelPreset,
    extraBabelPlugins: opts.extraBabelPlugins || [],
    extraBabelPresets: opts.extraBabelPresets || [],
    extraBabelIncludes: opts.extraBabelIncludes || [],
    extraEsbuildLoaderHandler: opts.extraEsbuildLoaderHandler || [],
    browsers: getBrowsersList({
      targets: userConfig.targets,
    }),
    useHash,
    staticPathPrefix:
        opts.staticPathPrefix !== undefined ? opts.staticPathPrefix : 'static/',
  };

  // name
  config.name(opts.name);

  // mode
  config.mode(opts.env);
  config.stats('none');

  // entry
  Object.keys(opts.entry).forEach((key) => {
    const entry = config.entry(key);
    if (isDev && opts.hmr) {
      entry.add(require.resolve('../../client/client/client'));
    }
    entry.add(opts.entry[key]);
  });

  // devtool
  config.devtool(
      isDev
          ? userConfig.devtool === false
              ? false
              : userConfig.devtool || DEFAULT_DEVTOOL
          : userConfig.devtool!,
  );

  // output
  const absOutputPath = resolve(
      opts.cwd,
      userConfig.outputPath || DEFAULT_OUTPUT_PATH,
  );
  const disableCompress = process.env.COMPRESS === 'none';
  config.output.path(absOutputPath)
      .filename(useHash ? `[name].[contenthash:8].js` : `[name].js`)
      .chunkFilename(useHash ? `[name].[contenthash:8].async.js` : `[name].async.js`,)
      .publicPath(userConfig.publicPath || 'auto')
      .pathinfo(isDev || disableCompress)
      .set(
          'assetModuleFilename',
          `${applyOpts.staticPathPrefix}[name].[hash:8][ext]`,
      )
      .set('hashFunction', 'xxhash64');

  // resolve
  // prettier-ignore
  config.resolve
      .set('symlinks', true)
      .modules
      .add('node_modules')
      .end()
      .alias
      .merge(userConfig.alias || {})
      .end()
      .extensions
      .merge([
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.mjs',
        '.cjs',
        '.json',
        '.wasm'
      ])
      .end();

  // externals
  config.externals(userConfig.externals || []);

  // target
  config.target(['web', 'es5']);

  // experiments
  config.experiments({
    topLevelAwait: true,
    outputModule: !!userConfig.esm,
  });

  // rules
  await addJavaScriptRules(applyOpts);
  await addCSSRules(applyOpts);

  // chain webpack
  if (opts.chainWebpack) {
    await opts.chainWebpack(config, {
      env: opts.env,
      webpack,
    });
  }
  if (userConfig.chainWebpack) {
    await userConfig.chainWebpack(config, {
      env: opts.env,
      webpack,
    });
  }

  let webpackConfig = config.toConfig();

  if (opts.modifyWebpackConfig) {
    webpackConfig = await opts.modifyWebpackConfig(webpackConfig, {
      env: opts.env,
      webpack,
    });
  }

  return webpackConfig;
}