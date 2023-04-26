import {Env, ServiceStage} from "../types";
import type { Arguments } from "yargs-parser";
import { join } from "path";
import {DEFAULT_FRAMEWORK_NAME} from "../constants";
import {Config} from "../config/config";
import { getPaths } from "./getPaths";

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

  async run(opts: { name: string; args?: any }){
    const { name, args = {} } = opts;
    // shift the command itself
    if (args._[0] === name) args._.shift();
    this.args = args;
    this.name = name;
    this.stage = ServiceStage.init;

    // get pkg from package.json
    this.pkg = require(join(this.cwd, 'package.json'));
    this.pkgPath = join(this.cwd, 'package.json');
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
    // todo
    // resolve initial presets and plugins

    // register presets and plugins
    this.stage = ServiceStage.initPresets;

    this.stage = ServiceStage.initPlugins;

    // collect configSchemas and configDefaults
    // setup api.config from modifyConfig and modifyDefaultConfig
    this.stage = ServiceStage.resolveConfig;

    // applyPlugin collect app data
    this.stage = ServiceStage.collectAppData;

    // applyPlugin onCheck
    this.stage = ServiceStage.onCheck;

    // applyPlugin onStart
    this.stage = ServiceStage.onStart;

    // run command
    this.stage = ServiceStage.runCommand;
  }
}