import * as clackPrompts from '../compiled/@clack/prompts';
import address from '../compiled/address';
import axios from '../compiled/axios';
import chalk from '../compiled/chalk';
import cheerio from '../compiled/cheerio';
import crossSpawn from '../compiled/cross-spawn';
import debug from '../compiled/debug';
import deepmerge from '../compiled/deepmerge';
import * as execa from '../compiled/execa';
import fsExtra from '../compiled/fs-extra';
import glob from '../compiled/glob';
// import globby from '../compiled/globby';
import remapping from '../compiled/@ampproject/remapping';
import * as fastestLevenshtein from '../compiled/fastest-levenshtein';
import * as filesize from '../compiled/filesize';
import * as gzipSize from '../compiled/gzip-size';
import lodash from '../compiled/lodash';
import MagicString from '../compiled/magic-string';
import Mustache from '../compiled/mustache';
import * as pkgUp from '../compiled/pkg-up';
import portfinder from '../compiled/portfinder';
import prompts from '../compiled/prompts';
import resolve from '../compiled/resolve';
import rimraf from '../compiled/rimraf';
import semver from '../compiled/semver';
import stripAnsi from '../compiled/strip-ansi';
import * as tsconfigPaths from '../compiled/tsconfig-paths';
import yParser from '../compiled/yargs-parser';
import { z } from '../compiled/zod';
import * as logger from "./logger";
import * as printHelp from './printHelp';
import BaseGenerator from './BaseGenerator/BaseGenerator';
import generateFile from './BaseGenerator/generateFile';
import updatePackageJSON from './updatePackageJSON';
import installDeps from './installDeps';
import { isTypeScriptFile } from "./utils/isTypeScriptFile";
import getGitInfo from './getGitInfo';

export * from './npmClient';
export * as register from './register';
export * from "./winPath";
export * from './zod/isZodSchema';
export * from './setNoDeprecation';
export * from './importLazy';
export * from './isLocalDev';
export * from './tryPaths';


export {
    BaseGenerator,
    getGitInfo,
    isTypeScriptFile,
    installDeps,
    updatePackageJSON,
    generateFile,
    tsconfigPaths,
    stripAnsi,
    prompts,
    Mustache,
    MagicString,
    gzipSize,
    filesize,
    fastestLevenshtein,
    remapping,
    execa,
    deepmerge,
    debug,
    clackPrompts,
    address,
    portfinder,
    printHelp,
    lodash,
    resolve,
    pkgUp,
    axios,
    cheerio,
    chalk,
    crossSpawn,
    glob,
    fsExtra,
    semver,
    rimraf,
    yParser,
    logger,
    z as zod
}
