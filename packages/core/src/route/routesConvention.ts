import {existsSync, lstatSync, readdirSync, statSync } from "fs";
import {extname, relative, resolve } from "path";
import { defineRoutes } from "./defineRoutes";
import {byLongestFirst, createRouteId, findParentRouteId, isRouteModuleFile} from "./utils";
import {winPath} from "@umajs/utils";


export function getConventionRoutes(opts: {
  base: string;
  prefix?: string;
  exclude?: RegExp[];
}) {
  const files: { [routeId: string]: string } = {};
  if (!(existsSync(opts.base) && statSync(opts.base).isDirectory())) {
    return {};
  }
  const { base, exclude, prefix } = opts;
  visitFiles({
    dir: base,
    visitor: (file) => {
      const routeId = createRouteId(file);
      if (isRouteModuleFile({ file: winPath(file), exclude })) {
        files[routeId] = winPath(file);
      }
    },
  });

  const routeIds = Object.keys(files).sort(byLongestFirst);

  return defineRoutes(defineNestedRoutes);
  function defineNestedRoutes(defineRoute: any, parentId?: string){
    const childRouteIds = routeIds.filter(
        (id) => findParentRouteId(routeIds, id) === parentId,
    );
    for (const childRouteId of childRouteIds) {
      const routePath = createRoutePath(
          parentId ? childRouteId.slice(parentId.length + 1) : childRouteId,
      );
      defineRoute({
        path: routePath,
        file: `${prefix || ''}${files[childRouteId]}`,
        children() {
          defineNestedRoutes(defineRoute, childRouteId);
        },
      });
    }
  }
}



function visitFiles(opts: {
  dir: string;
  visitor: (file: string) => void;
  baseDir?: string;
}): void {
  opts.baseDir = opts.baseDir || opts.dir;
  const { visitor, baseDir } = opts;
  for (const filename of readdirSync(opts.dir)) {
    const file = resolve(opts.dir, filename);
    const stat = lstatSync(file);
    if (stat.isDirectory()) {
      visitFiles({ ...opts, dir: file });
    } else if (
        stat.isFile() &&
        ['.tsx', '.ts', '.js', '.jsx', '.md', '.mdx', '.vue'].includes(
            extname(file),
        )
    ) {
      visitor(relative(baseDir, file));
    }
  }
}

function createRoutePath(routeId: string): string {
  let path = routeId
      // routes/$ -> routes/*
      // routes/nested/$.tsx (with a "routes/nested.tsx" layout)
      .replace(/^\$$/, '*')
      // routes/docs.$ -> routes/docs/*
      // routes/docs/$ -> routes/docs/*
      .replace(/(\/|\.)\$$/, '/*')
      // routes/$user -> routes/:user
      .replace(/\$/g, ':')
      // routes/not.nested -> routes/not/nested
      .replace(/\./g, '/');

  // only replace two `index` in the end of path
  // /index/index -> '/index'
  // index/index -> 'index'
  // a-index/index -> 'a-index/index'
  path = /(^|\/)index\/index$/.test(path) ? path.replace(/\/index$/, '') : path;
  // /(?<!:)\/?\bindex$/
  // e/index true
  // index true
  // e/:index false
  // e/index -> e  index -> ''  e/:index -> e/:index
  path = /\b\/?(?<!:)index$/.test(path) ? path.replace(/\/?index$/, '') : path;
  path = /\b\/?README$/.test(path) ? path.replace(/\/?README$/, '') : path;

  return path;
}