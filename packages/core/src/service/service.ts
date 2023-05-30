import {
  ApplyPluginsType,
  ConfigChangeType,
  EnableBy,
  Env, IEvent,
  IFrameworkType,
  IModify,
  PluginType,
  ServiceStage
} from "../types";
import type { Arguments } from "yargs-parser";
import {isAbsolute, join} from "path";
import {DEFAULT_FRAMEWORK_NAME} from "../constants";
import {Config} from "../config/config";
import { getPaths } from "./getPaths";
import { Plugin } from './plugin';
import {noopStorage, Telemetry} from "./telemetry";
import {PluginAPI} from "./pluginAPI";
import {chalk, lodash} from "@umajs/utils";
import { Command } from './command';
import {Hook} from "./hook";

import type { BuildResult } from '@umajs/bundler-utils/compiled/esbuild';

import {
  AsyncSeriesWaterfallHook, SyncWaterfallHook,
} from '@umajs/bundler-utils/compiled/tapable';

type DeclareKind = 'value' | 'type';
type SimpleImportSpecifier =
    | {
  type: 'ImportDefaultSpecifier';
  local: string;
}
    | {
  type: 'ImportNamespaceSpecifier';
  local: string;
  imported: string;
}
    | {
  type: 'ImportNamespaceSpecifier';
  local?: string;
};
type SimpleExportSpecifier =
    | {
  type: 'ExportDefaultSpecifier';
  exported: string;
}
    | {
  type: 'ExportNamespaceSpecifier';
  exported?: string;
}
    | {
  type: 'ExportSpecifier';
  exported: string;
  local: string;
};

type Declaration =
    | {
  type: 'ImportDeclaration';
  source: string;
  specifiers: Array<SimpleImportSpecifier>;
  importKind: DeclareKind;
  start: number;
  end: number;
}
    | {
  type: 'DynamicImport';
  source: string;
  start: number;
  end: number;
}
    | {
  type: 'ExportNamedDeclaration';
  source: string;
  specifiers: Array<SimpleExportSpecifier>;
  exportKind: DeclareKind;
  start: number;
  end: number;
}
    | {
  type: 'ExportAllDeclaration';
  source: string;
  start: number;
  end: number;
};

interface IOpts {
  cwd: string;
  env: Env;
  plugins?: string[];
  presets?: string[];
  frameworkName?: string;
  defaultConfigFiles?: string[];
}

export class Service {
  private opts: IOpts;
  cwd: string;
  env: Env;
  args: Arguments = { _: [], $0: '' };
  name: string = '';
  stage: ServiceStage = ServiceStage.uninitialized;
  pkg: {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: any;
  } = {};
  pkgPath: string = '';
  configManager: Config | null = null;
  userConfig: Record<string, any> = {};
  paths: {
    cwd?: string;
    absSrcPath?: string;
    absPagesPath?: string;
    absApiRoutesPath?: string;
    absTmpPath?: string;
    absNodeModulesPath?: string;
    absOutputPath?: string;
  } = {};
  plugins: Record<string, Plugin> = {};
  telemetry = new Telemetry();

  pluginMethods: Record<string, { plugin: Plugin; fn: Function }> = {};
  keyToPluginMap: Record<string, Plugin> = {};

  configSchemas: Record<string, any> = {};
  configDefaults: Record<string, any> = {};
  configOnChanges: Record<string, any> = {};
  config: Record<string, any> = {};
  commands: Record<string, Command> = {};

  hooks: Record<string, Hook[]> = {};
  skipPluginIds: Set<string> = new Set<string>();
  appData: {
    deps?: Record<
        string,
        {
          version: string;
          matches: string[];
          subpaths: string[];
          external?: boolean;
        }
        >;
    framework?: IFrameworkType;
    prepare?: {
      buildResult: BuildResult;
      fileImports?: Record<string, Declaration[]>;
    };
    [key: string]: any;
  } = {};
  generators: Record<string, Generator> = {};

  constructor(opts: IOpts) {
    this.cwd = opts.cwd;
    this.env = opts.env;
    this.opts = opts;
  }

  async getPaths() {
    // get paths
    const paths = getPaths({
      cwd: this.cwd,
      env: this.env,
      prefix: this.opts.frameworkName || DEFAULT_FRAMEWORK_NAME,
    });
    return paths;
  }

  async initPlugin(opts: {
    plugin: Plugin;
    presets?: Plugin[];
    plugins: Plugin[];
  }){
    const { plugin, plugins, presets } = opts;
    const { id } = plugin;
    this.plugins[id] = plugin;
    const pluginAPI = new PluginAPI({
      plugin,
      service: this,
    });
    pluginAPI.registerPresets = pluginAPI.registerPresets.bind(
      pluginAPI,
      presets || [],
    );
    pluginAPI.registerPlugins = pluginAPI.registerPlugins.bind(
      pluginAPI,
      plugins,
    );
    const proxyPluginAPI = PluginAPI.proxyPluginAPI({
      service: this,
      pluginAPI,
      serviceProps: [
        'appData',
        'applyPlugins',
        'args',
        'config',
        'cwd',
        'pkg',
        'pkgPath',
        'name',
        'paths',
        'userConfig',
        'env',
        'isPluginEnable',
      ],
      staticProps: {
        ApplyPluginsType,
        ConfigChangeType,
        EnableBy,
        ServiceStage,
        service: this,
      },
    });

    let dateStart = new Date();
    let ret = await plugin.apply()(proxyPluginAPI);
    plugin.time.register = new Date().getTime() - dateStart.getTime();
    this.keyToPluginMap[plugin.key] = opts.plugin;
    if (ret?.presets) {
      ret.presets = ret.presets.map(
          (preset: string) =>
              new Plugin({
                path: preset,
                type: PluginType.preset,
                cwd: this.cwd,
              }),
      );
    }
    if (ret?.plugins) {
      ret.plugins = ret.plugins.map(
          (plugin: string) =>
              new Plugin({
                path: plugin,
                type: PluginType.plugin,
                cwd: this.cwd,
              }),
      );
    }
    return ret || {};
  }

  async initPreset(opts: {
    preset: Plugin;
    presets: Plugin[];
    plugins: Plugin[];
  }) {
    const { presets, plugins } = await this.initPlugin({
      plugin: opts.preset,
      presets: opts.presets,
      plugins: opts.plugins,
    });
    opts.presets.unshift(...(presets || []));
    opts.plugins.push(...(plugins || []));
  }

  async resolveConfig() {
    const resolveMode = this.commands[this.name].configResolveMode;
    // todo applyPlugins 方法
    const config = await this.applyPlugins({
      key: 'modifyConfig',
      // why clone deep?
      // user may change the config in modifyConfig
      // e.g. memo.alias = xxx
      initialValue: lodash.cloneDeep(
          resolveMode === 'strict'
              ? this.configManager!.getConfig({
                schemas: this.configSchemas,
              }).config
              : this.configManager!.getUserConfig().config,
      ),
      args: { paths: this.paths },
    });
    const defaultConfig = await this.applyPlugins({
      key: 'modifyDefaultConfig',
      // 避免 modifyDefaultConfig 时修改 this.configDefaults
      initialValue: lodash.cloneDeep(this.configDefaults),
    });
    this.config = lodash.merge(defaultConfig, config) as Record<string, any>;

    return { config, defaultConfig };
  }

  applyPlugins<T>(opts: {
    key: string;
    type?: ApplyPluginsType.event;
    initialValue?: any;
    args?: any;
    sync: true;
  }): typeof opts.initialValue | T;
  applyPlugins<T>(opts: {
    key: string;
    type?: ApplyPluginsType;
    initialValue?: any;
    args?: any;
  }): Promise<typeof opts.initialValue | T>;
  applyPlugins<T>(opts: {
    key: string;
    type?: ApplyPluginsType;
    initialValue?: any;
    args?: any;
    sync?: boolean;
  }): Promise<typeof opts.initialValue | T> | (typeof opts.initialValue | T) {
    const {key} = opts;
    const hooks = this.hooks[key] || [];
    let type = opts.type;
    // guess type from key
    if (!type) {
      if (opts.key.startsWith('on')) {
        type = ApplyPluginsType.event;
      } else if (opts.key.startsWith('modify')) {
        type = ApplyPluginsType.modify;
      } else if (opts.key.startsWith('add')) {
        type = ApplyPluginsType.add;
      } else {
        throw new Error(
            `Invalid applyPlugins arguments, type must be supplied for key ${opts.key}.`,
        );
      }
    }
    switch (type) {
      case ApplyPluginsType.add:
        const tAdd = new AsyncSeriesWaterfallHook(['memo']);
        for (const hook of hooks) {
          if (!this.isPluginEnable(hook)) continue;
          tAdd.tapPromise(
              {
                name: hook.plugin.key,
                stage: hook.stage || 0,
                before: hook.before,
              },
              async (memo: any) => {
                const dateStart = new Date();
                const items = await hook.fn(opts.args);
                hook.plugin.time.hooks[opts.key] ||= [];
                hook.plugin.time.hooks[opts.key].push(
                    new Date().getTime() - dateStart.getTime(),
                );
                return memo.concat(items);
              },
          );
        }
        return tAdd.promise(opts.initialValue || []) as Promise<T>;
      case ApplyPluginsType.modify:
        const tModify = new AsyncSeriesWaterfallHook(['memo']);
        for (const hook of hooks) {
          if (!this.isPluginEnable(hook)) continue;
          tModify.tapPromise(
              {
                name: hook.plugin.key,
                stage: hook.stage || 0,
                before: hook.before,
              },
              async (memo: any) => {
                const dateStart = new Date();
                const ret = await hook.fn(memo, opts.args);
                hook.plugin.time.hooks[opts.key] ||= [];
                hook.plugin.time.hooks[opts.key].push(
                    new Date().getTime() - dateStart.getTime(),
                );
                return ret;
              },
          );
        }
        return tModify.promise(opts.initialValue) as Promise<T>;
      case ApplyPluginsType.event:
        if (opts.sync) {
          const tEvent = new SyncWaterfallHook(['_']);
          hooks.forEach((hook) => {
            if (this.isPluginEnable(hook)) {
              tEvent.tap(
                  {
                    name: hook.plugin.key,
                    stage: hook.stage || 0,
                    before: hook.before,
                  },
                  () => {
                    const dateStart = new Date();
                    hook.fn(opts.args);
                    hook.plugin.time.hooks[opts.key] ||= [];
                    hook.plugin.time.hooks[opts.key].push(
                        new Date().getTime() - dateStart.getTime(),
                    );
                  },
              );
            }
          });

          return tEvent.call(1) as T;
        }

        const tEvent = new AsyncSeriesWaterfallHook(['_']);
        for (const hook of hooks) {
          if (!this.isPluginEnable(hook)) continue;
          tEvent.tapPromise(
              {
                name: hook.plugin.key,
                stage: hook.stage || 0,
                before: hook.before,
              },
              async () => {
                const dateStart = new Date();
                await hook.fn(opts.args);
                hook.plugin.time.hooks[opts.key] ||= [];
                hook.plugin.time.hooks[opts.key].push(
                    new Date().getTime() - dateStart.getTime(),
                );
              },
          );
        }
        return tEvent.promise(1) as Promise<T>;
      default:
        throw new Error(
            `applyPlugins failed, type is not defined or is not matched, got ${opts.type}.`,
        );
    }
  }

  isPluginEnable(hook: Hook | string) {
    let plugin: Plugin;
    if ((hook as Hook).plugin) {
      plugin = (hook as Hook).plugin;
    } else {
      plugin = this.keyToPluginMap[hook as string];
      if (!plugin) return false;
    }
    const { id, key, enableBy } = plugin;
    if (this.skipPluginIds.has(id)) return false;
    if (this.userConfig[key] === false) return false;
    if (this.config[key] === false) return false;
    if (enableBy === EnableBy.config) {
      // TODO: 提供单独的命令用于启用插件
      // this.userConfig 中如果存在，启用
      // this.config 好了之后如果存在，启用
      // this.config 在 modifyConfig 和 modifyDefaultConfig 之后才会 ready
      // 这意味着 modifyConfig 和 modifyDefaultConfig 只能判断 api.userConfig
      // 举个具体场景:
      //   - p1 enableBy config, p2 modifyDefaultConfig p1 = {}
      //   - p1 里 modifyConfig 和 modifyDefaultConfig 仅 userConfig 里有 p1 有效，其他 p2 开启时即有效
      //   - p2 里因为用了 modifyDefaultConfig，如果 p2 是 enableBy config，需要 userConfig 里配 p2，p2 和 p1 才有效
      return key in this.userConfig || (this.config && key in this.config);
    }
    if (typeof enableBy === 'function')
      return enableBy({
        userConfig: this.userConfig,
        config: this.config,
        env: this.env,
      });
    // EnableBy.register
    return true;
  }

  async run(opts: { name: string; args?: any }){
    const { name, args = {} } = opts;
    // shift the command itself
    if (args._[0] === name) args._.shift();
    this.args = args;
    this.name = name;
    this.stage = ServiceStage.init;

    // get pkg from package.json
    let pkg = this.pkg = require(join(this.cwd, 'package.json'));
    let pkgPath = this.pkgPath = join(this.cwd, 'package.json');
    const prefix = this.opts.frameworkName || DEFAULT_FRAMEWORK_NAME;
    const specifiedEnv = process.env[`${prefix}_ENV`.toUpperCase()];

    const configManager = new Config({
      cwd: this.cwd,
      env: this.env,
      defaultConfigFiles: this.opts.defaultConfigFiles,
      specifiedEnv,
    });

    this.configManager = configManager;
    this.userConfig = configManager.getUserConfig().config;
    // get paths
    // temporary paths for use by function generateFinalConfig.
    // the value of paths may be updated by plugins later
    // 抽离成函数，方便后续继承覆盖
    this.paths = await this.getPaths();
    // resolve initial presets and plugins
    const { plugins, presets } = Plugin.getPluginsAndPresets({
      cwd: this.cwd,
      pkg,
      plugins: [require.resolve('./generatePlugin')].concat(
          this.opts.plugins || [],
      ),
      presets: [require.resolve('./servicePlugin')].concat(
          this.opts.presets || [],
      ),
      userConfig: this.userConfig,
      prefix,
    });
    // register presets and plugins
    this.stage = ServiceStage.initPresets;
    const presetPlugins: Plugin[] = [];
    while (presets.length) {
      await this.initPreset({
        preset: presets.shift()!,
        presets,
        plugins: presetPlugins,
      });
    }
    this.stage = ServiceStage.initPlugins;

    while (plugins.length) {
      await this.initPlugin({ plugin: plugins.shift()!, plugins });
    }
    const command = this.commands[name];
    // collect configSchemas and configDefaults
    for (const id of Object.keys(this.plugins)) {
      const { config, key } = this.plugins[id];
      if (config.schema) this.configSchemas[key] = config.schema;
      if (config.default !== undefined) {
        this.configDefaults[key] = config.default;
      }
      this.configOnChanges[key] = config.onChange || ConfigChangeType.reload;
    }
    // setup api.config from modifyConfig and modifyDefaultConfig
    this.stage = ServiceStage.resolveConfig;
    const { defaultConfig } = await this.resolveConfig();
    if (this.config.outputPath) {
      this.paths.absOutputPath = isAbsolute(this.config.outputPath)
          ? this.config.outputPath
          : join(this.cwd, this.config.outputPath);
    }

    this.paths = await this.applyPlugins({
      key: 'modifyPaths',
      initialValue: this.paths,
    });
    const storage = await this.applyPlugins({
      key: 'modifyTelemetryStorage',
      initialValue: noopStorage,
    });

    this.telemetry.useStorage(storage);
    // applyPlugin collect app data
    this.stage = ServiceStage.collectAppData;
    this.appData = await this.applyPlugins({
      key: 'modifyAppData',
      initialValue: {
        // base
        cwd: this.cwd,
        pkg,
        pkgPath,
        plugins: this.plugins,
        presets,
        name,
        args,
        // config
        userConfig: this.userConfig,
        mainConfigFile: configManager.mainConfigFile,
        config: this.config,
        defaultConfig: defaultConfig,
        // TODO
        // moduleGraph,
        // routes,
        // npmClient,
        // nodeVersion,
        // gitInfo,
        // gitBranch,
        // debugger info,
        // devPort,
        // devHost,
        // env
      },
    });

    // applyPlugin onCheck
    this.stage = ServiceStage.onCheck;
    await this.applyPlugins({
      key: 'onCheck',
    });
    // applyPlugin onStart
    this.stage = ServiceStage.onStart;
    await this.applyPlugins({
      key: 'onStart',
    });
    // run command
    this.stage = ServiceStage.runCommand;
    let ret = await command.fn({ args });
    this._profilePlugins();
    return ret;
  }

  _profilePlugins() {
    if (this.args.profilePlugins) {
      Object.keys(this.plugins)
          .map((id)=>{
            const plugin = this.plugins[id];
            const total = totalTime(plugin);
            return {
              id,
              total,
              register: plugin.time.register || 0,
              hooks: plugin.time.hooks,
            };
          })
          .filter((time)=>{
            return time.total > (this.args.profilePluginsLimit ?? 10);
          })
          .sort((a, b) => (b.total > a.total ? 1 : -1))
          .forEach((time) => {
            console.log(chalk.green('plugin'), time.id, time.total);
            if (this.args.profilePluginsVerbose) {
              console.log('      ', chalk.green('register'), time.register);
              console.log(
                  '      ',
                  chalk.green('hooks'),
                  JSON.stringify(sortHooks(time.hooks)),
              );
            }
          });
    }
    function sortHooks(hooks: Record<string, number[]>) {
      const ret: Record<string, number[]> = {};
      Object.keys(hooks)
          .sort((a, b) => {
            return add(hooks[b]) - add(hooks[a]);
          })
          .forEach((key) => {
            ret[key] = hooks[key];
          });
      return ret;
    }
    function totalTime(plugin: Plugin){
      const { time } = plugin;
      return (
          (time.register || 0) +
              Object.values(time.hooks).reduce((a,b) => a + add(b), 0)
      );
    }

    function add(nums: number[]){
      return nums.reduce((a, b) => a + b, 0);
    }
  }
}

export interface IServicePluginAPI {
  appData: typeof Service.prototype.appData;
  applyPlugins: typeof Service.prototype.applyPlugins;
  args: typeof Service.prototype.args;
  config: typeof Service.prototype.config;
  cwd: typeof Service.prototype.cwd;
  generators: typeof Service.prototype.generators;
  pkg: typeof Service.prototype.pkg;
  pkgPath: typeof Service.prototype.pkgPath;
  name: typeof Service.prototype.name;
  paths: Required<typeof Service.prototype.paths>;
  userConfig: typeof Service.prototype.userConfig;
  env: typeof Service.prototype.env;
  isPluginEnable: typeof Service.prototype.isPluginEnable;

  onCheck: IEvent<null>;
  onStart: IEvent<null>;
  modifyAppData: IModify<typeof Service.prototype.appData, null>;
  modifyConfig: IModify<
      typeof Service.prototype.config,
      { paths: Record<string, string> }
      >;
  modifyDefaultConfig: IModify<typeof Service.prototype.config, null>;
  modifyPaths: IModify<typeof Service.prototype.paths, null>;
  modifyTelemetryStorage: IModify<typeof Service.prototype.telemetry, null>;

  ApplyPluginsType: typeof ApplyPluginsType;
  ConfigChangeType: typeof ConfigChangeType;
  EnableBy: typeof EnableBy;
  ServiceStage: typeof ServiceStage;

  registerPresets: (presets: any[]) => void;
  registerPlugins: (plugins: (Plugin | {})[]) => void;
}