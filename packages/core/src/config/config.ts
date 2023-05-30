import {Env} from "../types";
import {DEFAULT_CONFIG_FILES, LOCAL_EXT, SHORT_ENV} from "../constants";
import { join } from "path";
import { existsSync } from "fs";
import esbuild from "esbuild";
import {addExt, getAbsFiles} from "./util";
import {lodash, register} from "@umajs/utils";


type ISchema = Record<string, any>;

interface IOpts {
  cwd: string;
  env: Env;
  specifiedEnv?: string;
  defaultConfigFiles?: string[];
}

export class Config {
  public opts: IOpts;
  public mainConfigFile: string | null;
  public prevConfig: any;
  public files: string[] = [];
  constructor(opts: IOpts) {
    this.opts = opts;
    this.mainConfigFile = Config.getMainConfigFile(this.opts);
    this.prevConfig = null;
  }

  static getMainConfigFile(opts: {
    cwd: string;
    defaultConfigFiles?: string[];
  }){
    let mainConfigFile = null;
    for (const configFile of opts.defaultConfigFiles || DEFAULT_CONFIG_FILES) {
      const absConfigFile = join(opts.cwd, configFile);
      if (existsSync(absConfigFile)) {
        mainConfigFile = absConfigFile;
        break;
      }
    }
    return mainConfigFile;
  }

  getConfig(opts: { schemas: ISchema }) {
    const { config, files } = this.getUserConfig();
    console.log(opts)
    this.files = files;
    return (this.prevConfig = {
      config: config,
      files,
    });
  }


  static getConfigFiles(opts: {
    mainConfigFile: string | null;
    env: Env;
    specifiedEnv?: string;
  }){
    const ret: string[] = [];
    const { mainConfigFile } = opts;
    const specifiedEnv = opts.specifiedEnv || '';
    if(mainConfigFile){
      const env = SHORT_ENV[opts.env] || opts.env;
      ret.push(
          ...[
            mainConfigFile,
            specifiedEnv &&
            addExt({ file: mainConfigFile, ext: `.${specifiedEnv}` }),
            addExt({ file: mainConfigFile, ext: `.${env}` }),
            specifiedEnv &&
            addExt({
              file: mainConfigFile,
              ext: `.${env}.${specifiedEnv}`,
            }),
          ].filter(Boolean),
      );

      if (opts.env === Env.development) {
        ret.push(addExt({ file: mainConfigFile, ext: LOCAL_EXT }));
      }
    }
    return ret;
  }

  static getUserConfig(opts: { configFiles: string[] }) {
    let config = {};
    let files: string[] = [];

    for (const configFile of opts.configFiles) {
      if (existsSync(configFile)) {
        // register
        register.register({
          implementor: esbuild,
        });
        register.clearFiles();
        try {
          config = lodash.merge(config, require(configFile).default);
        } catch (e) {
          // Error.prototype.cause has been fully supported from  node v16.9.0
          // Ref https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause#browser_compatibility
          // if (semver.lt(semver.clean(process.version)!, '16.9.0')) {
          //   throw e;
          // }

          throw new Error(`Parse config file failed: [${configFile}]`, {
            cause: e as any,
          });
        }

        for (const file of register.getFiles()) {
          delete require.cache[file];
        }
        // includes the config File
        files.push(...register.getFiles());
        register.restore();
      }
      else {
        files.push(configFile);
      }
    }

    return {
      config,
      files,
    };
  }

  getUserConfig(){
    const configFiles = Config.getConfigFiles({
      mainConfigFile: this.mainConfigFile,
      env: this.opts.env,
      specifiedEnv: this.opts.specifiedEnv,
    });
    return Config.getUserConfig({
      configFiles: getAbsFiles({
        files: configFiles,
        cwd: this.opts.cwd,
      }),
    });
  }
}