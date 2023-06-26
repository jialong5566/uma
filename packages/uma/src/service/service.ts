import { Service as CoreService } from "@umajs/core";
import {dirname, join} from "path";
import {getCwd} from "./cwd";
import {DEFAULT_CONFIG_FILES, FRAMEWORK_NAME} from "../constants";
import {existsSync} from "fs";

export class Service extends CoreService {
  constructor(opts?: any) {
    process.env.UMA_DIR = dirname(require.resolve('../../package'));
    const cwd = getCwd();
    require('./requireHook');
    super({
      ...opts,
      env: process.env.NODE_ENV,
      cwd,
      defaultConfigFiles: opts?.defaultConfigFiles || DEFAULT_CONFIG_FILES,
      frameworkName: opts?.frameworkName || FRAMEWORK_NAME,
      presets: [require.resolve('@umajs/preset-uma'), ...(opts?.presets || [])],
      plugins: [
        existsSync(join(cwd, 'plugin.ts')) && join(cwd, 'plugin.ts'),
        existsSync(join(cwd, 'plugin.js')) && join(cwd, 'plugin.js'),
      ].filter(Boolean),
    });
  }

  async run2(opts: { name: string; args?: any}){
    let name = opts.name;
    if (opts?.args.version || name === 'v') {
      name = 'version';
    } else if (opts?.args.help || !name || name === 'h') {
      name = 'help';
    }
    return await this.run({ ...opts, name });
  }
}