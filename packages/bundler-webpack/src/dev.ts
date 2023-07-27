import {Env, IConfig} from "./types";
import type { IOpts as IConfigOpts } from './config/config';
import {createServer} from "./server/server";
import {join, resolve} from "path";
import {importLazy} from "@umajs/utils";

const configModule: typeof import('./config/config') = importLazy(
    require.resolve('./config/config'),
);
type IOpts = {
  afterMiddlewares?: any[];
  beforeMiddlewares?: any[];
  onDevCompileDone?: Function;
  onProgress?: Function;
  onMFSUProgress?: Function;
  port?: number;
  host?: string;
  ip?: string;
  babelPreset?: any;
  chainWebpack?: Function;
  modifyWebpackConfig?: Function;
  beforeBabelPlugins?: any[];
  beforeBabelPresets?: any[];
  extraBabelPlugins?: any[];
  extraBabelPresets?: any[];
  cwd: string;
  rootDir?: string;
  config: IConfig;
  entry: Record<string, string>;
  mfsuStrategy?: 'eager' | 'normal';
  mfsuInclude?: string[];
  srcCodeCache?: any;
  startBuildWorker?: (deps: any[]) => Worker;
  onBeforeMiddleware?: Function;
  disableCopy?: boolean;
} & Pick<IConfigOpts, 'cache' | 'pkg'>;

export function ensureSerializableValue(obj: any) {
  return JSON.parse(
      JSON.stringify(
          obj,
          (_key, value) => {
            if (typeof value === 'function') {
              return value.toString();
            }
            return value;
          },
          2,
      ),
  );
}

export async function dev(opts: IOpts){
  const { webpackConfig } = await setup(opts);
  await createServer({
    webpackConfig,
    userConfig: opts.config,
    cwd: opts.cwd,
    beforeMiddlewares: [
      // ...(mfsu?.getMiddlewares() || []),
      ...(opts.beforeMiddlewares || []),
    ],
    port: opts.port,
    host: opts.host,
    ip: opts.ip,
    afterMiddlewares: [...(opts.afterMiddlewares || [])],
    onDevCompileDone: opts.onDevCompileDone,
    onProgress: opts.onProgress,
    onBeforeMiddleware: opts.onBeforeMiddleware,
  });
}

export async function setup(opts: IOpts){
  const cacheDirectoryPath = resolve(
      opts.rootDir || opts.cwd,
      opts.config.cacheDirectoryPath || 'node_modules/.cache',
  );
  let mfsu = null;
  const webpackConfig = await configModule.getConfig({
    cwd: opts.cwd,
    rootDir: opts.rootDir,
    env: Env.development,
    entry: opts.entry,
    userConfig: opts.config,
    babelPreset: opts.babelPreset,
    extraBabelPlugins: [
      ...(opts.beforeBabelPlugins || []),
      ...(opts.extraBabelPlugins || []),
    ],
    extraBabelPresets: [
      ...(opts.beforeBabelPresets || []),
      ...(opts.extraBabelPresets || []),
    ],
    extraBabelIncludes: opts.config.extraBabelIncludes,
    extraEsbuildLoaderHandler: [],
    chainWebpack: opts.chainWebpack,
    modifyWebpackConfig: opts.modifyWebpackConfig,
    hmr: process.env.HMR !== 'none',
    analyze: process.env.ANALYZE,
    cache: opts.cache
        ? {
          ...opts.cache,
          cacheDirectory: join(
              cacheDirectoryPath,
              opts.mfsuStrategy === 'eager'
                  ? 'bundler-webpack-eager'
                  : 'bundler-webpack',
          ),
        }
        : undefined,
    pkg: opts.pkg,
    disableCopy: opts.disableCopy,
  });


  webpackConfig.resolve!.alias ||= {};
  // TODO: REMOVE ME
  ['@umajs/utils/compiled/strip-ansi', 'react-error-overlay'].forEach((dep) => {
    // @ts-ignore
    webpackConfig.resolve!.alias[dep] = require.resolve(dep);
  });

  return {
    mfsu,
    webpackConfig,
  };
}