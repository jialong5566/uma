import {GenerateFilesFn, IApi} from "../../types";
import {chalk, lodash, logger, rimraf, winPath} from "@umajs/utils";
import {basename, join} from "path";
import {addUnWatch, createDebouncedHandler, expandCSSPaths, expandJSPaths, watch} from "./watch";
import {existsSync, readdirSync, readFileSync} from "fs";
import {getBabelOpts} from "./getBabelOpts";
import {lazyImportFromCurrentPkg} from "../../utils/lazyImportFromCurrentPkg";
import {printMemoryUsage} from "./printMemoryUsage";

const MFSU_EAGER_DEFAULT_INCLUDE = [
  'react',
  'react-error-overlay',
  'react/jsx-dev-runtime',
  '@umijs/utils/compiled/strip-ansi',
];

const bundlerWebpack: typeof import('@umajs/bundler-webpack') =
    lazyImportFromCurrentPkg('@umajs/bundler-webpack');

export default (api: IApi) => {
  api.describe({
    enableBy(){
      return api.name === 'dev';
    }
  });
  api.registerCommand({
    name: 'dev',
    description: 'dev server for development',
    details: `
umi dev

# dev with specified port
PORT=8888 umi dev
`,
    async fn(){
      logger.info(chalk.cyan.bold(`Uma v${api.appData.umi.version}`));
      const enableVite = !!api.config.vite;

      // clear tmp
      rimraf.sync(api.paths.absTmpPath);

      await api.applyPlugins({
        key: 'onCheckPkgJSON',
        args: {
          origin: null,
          current: api.appData.pkg,
        },
      });

      const generate: GenerateFilesFn = async (opts) => {
        await api.applyPlugins({
          key: 'onGenerateFiles',
          args: {
            files: opts.files || null,
            isFirstTime: opts.isFirstTime,
          },
        });
      }
      await generate({
        isFirstTime: true,
      });

      const { absPagesPath, absSrcPath } = api.paths;

      const watcherPaths: string[] = await api.applyPlugins({
        key: 'addTmpGenerateWatcherPaths',
        initialValue: [
          absPagesPath,
          !api.config.routes && api.config.conventionRoutes?.base,
          join(absSrcPath, 'layouts'),
          ...expandJSPaths(join(absSrcPath, 'loading')),
          ...expandJSPaths(join(absSrcPath, 'app')),
          ...expandJSPaths(join(absSrcPath, 'global')),
          ...expandCSSPaths(join(absSrcPath, 'global')),
          ...expandCSSPaths(join(absSrcPath, 'overrides')),
        ].filter(Boolean),
      });

      lodash.uniq<string>(watcherPaths.map(winPath)).forEach((p: string) => {
        watch({
          path: p,
          addToUnWatches: true,
          onChange: createDebouncedHandler({
            timeout: 2000,
            async onChange(opts) {
              await generate({ files: opts.files, isFirstTime: false });
            },
          }),
        });
      });

      // watch package.json change
      const pkgPath = join(api.cwd, 'package.json');
      watch({
        path: pkgPath,
        addToUnWatches: true,
        onChange() {
          // Why try catch?
          // ref: https://github.com/umijs/umi/issues/8608
          try {
            const origin = api.appData.pkg;
            api.appData.pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
            api.applyPlugins({
              key: 'onCheckPkgJSON',
              args: {
                origin,
                current: api.appData.pkg,
              },
            });
            api.applyPlugins({
              key: 'onPkgJSONChanged',
              args: {
                origin,
                current: api.appData.pkg,
              },
            });
          } catch (e) {
            logger.error(e);
          }
        },
      });

      // watch config change
      addUnWatch(
          api.service.configManager!.watch({
            schemas: api.service.configSchemas,
            onChangeTypes: api.service.configOnChanges,
            async onChange(opts) {
              await api.applyPlugins({
                key: 'onCheckConfig',
                args: {
                  config: api.config,
                  userConfig: api.userConfig,
                },
              });
              const { data } = opts;
              if (data.changes[api.ConfigChangeType.reload]) {
                logger.event(
                    `config ${data.changes[api.ConfigChangeType.reload].join(
                        ', ',
                    )} changed, restart server...`,
                );
                api.restartServer();
                return;
              }
              await api.service.resolveConfig();
              if (data.changes[api.ConfigChangeType.regenerateTmpFiles]) {
                logger.event(
                    `config ${data.changes[
                        api.ConfigChangeType.regenerateTmpFiles
                        ].join(', ')} changed, regenerate tmp files...`,
                );
                await generate({ isFirstTime: false });
              }
              for await (const fn of data.fns) {
                await fn();
              }
            },
          }),
      );
      // watch plugin change
      const pluginFiles: string[] = [
        join(api.cwd, 'plugin.ts'),
        join(api.cwd, 'plugin.js'),
      ];
      pluginFiles.forEach((filePath: string) => {
        watch({
          path: filePath,
          addToUnWatches: true,
          onChange() {
            logger.event(`${basename(filePath)} changed, restart server...`);
            api.restartServer();
          },
        });
      });

      // watch public dir change and restart server
      function watchPublicDirChange() {
        const publicDir = join(api.cwd, 'public');
        const isPublicAvailable =
            existsSync(publicDir) && readdirSync(publicDir).length;
        let restarted = false;
        const restartServer = () => {
          if (restarted) return;
          restarted = true;
          logger.event(`public dir changed, restart server...`);
          api.restartServer();
        };
        watch({
          path: publicDir,
          addToUnWatches: true,
          onChange(event, path) {
            if (isPublicAvailable) {
              // listen public dir delete event
              if (event === 'unlinkDir' && path === publicDir) {
                restartServer();
              } else if (
                  // listen public files all deleted
                  event === 'unlink' &&
                  existsSync(publicDir) &&
                  readdirSync(publicDir).length === 0
              ) {
                restartServer();
              }
            } else {
              // listen public dir add first file event
              if (
                  event === 'add' &&
                  existsSync(publicDir) &&
                  readdirSync(publicDir).length === 1
              ) {
                restartServer();
              }
            }
          },
        });
      }
      watchPublicDirChange();

      // start dev server
      const beforeMiddlewares = await api.applyPlugins({
        key: 'addBeforeMiddlewares',
        initialValue: [],
      });
      // const middlewares = await api.applyPlugins({
      //   key: 'addMiddlewares',
      //   initialValue: [],
      // });

      const {
        babelPreset,
        beforeBabelPlugins,
        beforeBabelPresets,
        extraBabelPlugins,
        extraBabelPresets,
      } = await getBabelOpts({ api });
      const chainWebpack = async (memo: any, args: Object) => {
        await api.applyPlugins({
          key: 'chainWebpack',
          type: api.ApplyPluginsType.modify,
          initialValue: memo,
          args,
        });
      };
      const modifyWebpackConfig = async (memo: any, args: Object) => {
        return await api.applyPlugins({
          key: 'modifyWebpackConfig',
          initialValue: memo,
          args,
        });
      };
      const modifyViteConfig = async (memo: any, args: Object) => {
        return await api.applyPlugins({
          key: 'modifyViteConfig',
          initialValue: memo,
          args,
        });
      };

      const debouncedPrintMemoryUsage = lodash.debounce(printMemoryUsage, 5000);

      let srcCodeCache: undefined;
      let startBuildWorker: (deps: any[]) => Worker = (() => {}) as any;

      const entry = await api.applyPlugins({
        key: 'modifyEntry',
        initialValue: {
          uma: join(api.paths.absTmpPath, 'uma.ts'),
        },
      });

      const opts: any = {
        config: api.config,
        pkg: api.pkg,
        cwd: api.cwd,
        rootDir: process.cwd(),
        entry,
        port: api.appData.port,
        host: api.appData.host,
        ip: api.appData.ip,
        ...(enableVite
            ? { modifyViteConfig }
            : { babelPreset, chainWebpack, modifyWebpackConfig }),
        beforeBabelPlugins,
        beforeBabelPresets,
        extraBabelPlugins,
        extraBabelPresets,
        beforeMiddlewares: ([] as RequestHandler[]).concat([
          ...beforeMiddlewares,
        ]),
        // vite 模式使用 ./plugins/ViteHtmlPlugin.ts 处理
        // afterMiddlewares: enableVite
        //     ? [middlewares.concat(faviconMiddleware)]
        //     : middlewares.concat([
        //       ...(api.config.mpa ? [] : [createRouteMiddleware({ api })]),
        //       // 放置 favicon 在 webpack middleware 之后，兼容 public 目录下有 favicon.ico 的场景
        //       // ref: https://github.com/umijs/umi/issues/8024
        //       faviconMiddleware,
        //     ]),
        onDevCompileDone(opts: any) {
          debouncedPrintMemoryUsage;
          // debouncedPrintMemoryUsage();
          api.appData.bundleStatus.done = true;
          api.applyPlugins({
            key: 'onDevCompileDone',
            args: opts,
          });
        },
        onProgress(opts: any) {
          api.appData.bundleStatus.progresses = opts.progresses;
        },
        onMFSUProgress(opts: any) {
          api.appData.mfsuBundleStatus = {
            ...api.appData.mfsuBundleStatus,
            ...opts,
          };
        },
        mfsuWithESBuild: api.config.mfsu?.esbuild,
        mfsuStrategy: api.config.mfsu?.strategy,
        cache: {
          buildDependencies: [
            api.pkgPath,
            api.service.configManager!.mainConfigFile || '',
          ].filter(Boolean),
        },
        srcCodeCache,
        mfsuInclude: lodash.union([
          ...MFSU_EAGER_DEFAULT_INCLUDE,
          ...(api.config.mfsu?.include || []),
        ]),
        startBuildWorker,
        onBeforeMiddleware(app: any) {
          api.applyPlugins({
            key: 'onBeforeMiddleware',
            args: {
              app,
            },
          });
        },
      };

      await api.applyPlugins({
        key: 'onBeforeCompiler',
        args: { compiler: enableVite ? 'vite' : 'webpack', opts },
      });

      await bundlerWebpack.dev(opts);
    }
  });
}