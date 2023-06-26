import {chalk, lodash, logger} from "@umajs/utils";
import {Service} from "./service";
import {IMetry} from "./telemetry";
import {Plugin} from "./plugin";
import {EnableBy, Env, IPluginConfig, PluginType, ServiceStage} from "../types";
import { Command, IOpts as ICommandOpts } from './command';
import {makeArray} from "./utils";
import { Hook, IOpts as IHookOpts } from './hook';


type Logger = typeof logger;

const resolveConfigModes = ['strict', 'loose'] as const;

export type ResolveConfigMode = (typeof resolveConfigModes)[number];

export class PluginAPI {
  service: Service;
  plugin: Plugin;
  logger: Logger;
  telemetry: IMetry;

  registerCommand(opts: Omit<ICommandOpts, 'plugin'> & { alias?: string | string[] }){
    const { alias } = opts;
    delete opts.alias;
    const registerCommand = (commandOpts: Omit<typeof opts, 'alias'>) => {
      const { name } = commandOpts;

      this.service.commands[name] = new Command({
        ...commandOpts,
        plugin: this.plugin,
      });
    }
    registerCommand(opts);
    if (alias) {
      const aliases = makeArray(alias);
      aliases.forEach((alias) => {
        registerCommand({ ...opts, name: alias });
      });
    }
  }

  describe(opts: {
    key?: string,
    config?: IPluginConfig;
    enableBy?: EnableBy | ((enableByOpts: { userConfig: any; env: Env}) => boolean)
  }){
    // default 值 + 配置开启冲突，会导致就算用户没有配 key，插件也会生效
    if (opts.enableBy === EnableBy.config && opts.config?.default) {
      throw new Error(
          `[plugin: ${this.plugin.id}] The config.default is not allowed when enableBy is EnableBy.config.`,
      );
    }
    this.plugin.merge(opts);
  }

  constructor(opts: { service: Service; plugin: Plugin }) {
    const { service, plugin } = opts;
    this.service = service;
    this.plugin = plugin;
    this.telemetry = service.telemetry.prefixWith(plugin.key);

    // logger
    const loggerKeys: (keyof Logger)[] = [
      'wait',
      'error',
      'warn',
      'ready',
      'info',
      'event',
      'debug',
      'fatal',
      'profile',
    ];
    // @ts-ignore
    this.logger = loggerKeys.reduce<Logger>((memo, key) => {
      // @ts-ignore
      memo[key] = (...message: string[]) => {
        const func = logger[key];
        if (typeof func !== 'function') {
          return;
        }
        if (key === 'profile') {
          // Ensure the first argument is profile `id`
          // @ts-ignore
          func(...message);
        } else {
          func(chalk.green(`[plugin: ${this.plugin.id}]`), ...message);
        }
      };
      return memo;
    }, {} as any);
  }

  registerPresets(source: Plugin[], presets: any[]) {
    source.splice(
        0,
        0,
        ...presets.map((preset) => {
          return new Plugin({
            path: preset,
            cwd: this.service.cwd,
            type: PluginType.preset,
          });
        }),
    );
  }

  registerPlugins(source: Plugin[], plugins: any[]) {
    const mappedPlugins = plugins.map(plugin => {
      if(lodash.isPlainObject(plugin)){
        plugin.type = PluginType.plugin;
        plugin.enableBy = plugin.enableBy || EnableBy.register;
        plugin.apply = plugin.apply || (() => () => {});
        plugin.config = plugin.config || {};
        plugin.time = { hooks: {} };
        return plugin;
      }
      else {
        return new Plugin({
          path: plugin,
          cwd: this.service.cwd,
          type: PluginType.plugin,
        });
      }
    });
    if (this.service.stage === ServiceStage.initPresets) {
      source.push(...mappedPlugins);
    } else {
      source.splice(0, 0, ...mappedPlugins);
    }
  }

  static proxyPluginAPI(opts: {
    pluginAPI: PluginAPI;
    service: Service;
    serviceProps: string[];
    staticProps: Record<string, any>;
  }) {
    const { pluginAPI, service, serviceProps, staticProps } = opts;
    return new Proxy(pluginAPI, {
      get: (target, prop: string, )=> {
        if(service.pluginMethods[prop]){
          return service.pluginMethods[prop].fn;
        }

        if(serviceProps.includes(prop)){
          // @ts-ignore
          const serviceProp = service[prop];
          return typeof serviceProp === 'function' ? serviceProp.bind(service) : serviceProp
        }

        if(prop in staticProps){
          return staticProps[prop];
        }

        // @ts-ignore
        return target[prop];
      }
    });
  }

  registerMethod(opts: { name: string; fn?: Function }) {
    this.service.pluginMethods[opts.name] = {
      plugin: this.plugin,
      fn:
          opts.fn ||
          // 这里不能用 arrow function，this 需指向执行此方法的 PluginAPI
          // 否则 pluginId 会不会，导致不能正确 skip plugin
          function (fn: Function | Object) {
            // @ts-ignore
            this.register({
              key: opts.name,
              ...(lodash.isPlainObject(fn) ? (fn as any) : { fn }),
            });
          },
    };
  }

  register(opts: Omit<IHookOpts, 'plugin'>) {
    this.service.hooks[opts.key] ||= [];
    this.service.hooks[opts.key].push(
        new Hook({ ...opts, plugin: this.plugin }),
    );
  }
};