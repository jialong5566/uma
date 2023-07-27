// @ts-ignore
import deepImports from '@umijs/bundler-webpack/compiled/webpack/deepImports.json';
import { join } from 'path';

const PKG_ROOT = join(__dirname, '../');
const resolve = (p: string) => join(PKG_ROOT, p);

const hookPropertyMap = new Map([
  ['webpack', resolve('compiled/webpack')],
  ['webpack/package', resolve('compiled/webpack/package')],
  ['webpack/package.json', resolve('compiled/webpack/package')],
  ['webpack/lib/webpack', resolve('compiled/webpack')],
  ['webpack/lib/webpack.js', resolve('compiled/webpack')],
]);

deepImports.forEach((item: string) => {
  const name = item.split('/').pop();
  hookPropertyMap.set(item, resolve(`compiled/webpack/${name}`));
  hookPropertyMap.set(`${item}.js`, resolve(`compiled/webpack/${name}`));
});

const mod = require('module');
const resolveFilename = mod._resolveFilename;
mod._resolveFilename = function (
    request: string,
    parent: any,
    isMain: boolean,
    options: any,
) {
  const hookResolved = hookPropertyMap.get(request);
  if (hookResolved) request = hookResolved;
  return resolveFilename.call(mod, request, parent, isMain, options);
};