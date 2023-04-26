interface IOpts {
  routes: any[];
  onResolveComponent?: (component: string) => string;
}

interface IMemo {
  id: number;
  ret: any;
}

export function getConfigRoutes(ops: IOpts){
  const memo: IMemo = {ret:{}, id: 1};
  const { routes, onResolveComponent } = ops;
  transformRoutes({
    routes,
    parentId: undefined,
    memo,
    onResolveComponent
  });
  return memo.ret;
}

function transformRoutes(opts: {
  routes: any[];
  parentId: undefined | string;
  memo: IMemo;
  onResolveComponent?: Function;
}){
  const { routes, parentId, memo, onResolveComponent } = opts;
  for (const route of routes) {
    transformRoute({
      route,
      parentId,
      memo,
      onResolveComponent
    });
  }
}

function transformRoute(opts: {
  route: any;
  parentId: undefined | string;
  memo: IMemo;
  onResolveComponent?: Function;
}){
  const { route, memo, parentId, onResolveComponent } = opts;
  const { routes, component, ...routeProps } = route;
  const id = String(memo.id++);

  let absPath = routeProps.path;
  if (absPath?.charAt(0) !== '/') {
    const parentAbsPath = parentId ? memo.ret[parentId].absPath.replace(/\/+$/, '/') : '/';
    absPath = endsWithStar(parentAbsPath) ? parentAbsPath : ensureWithSlash(parentAbsPath, absPath);
  }
  memo.ret[id] = {
    ...routeProps,
    path: routeProps.path,
    ...(component ? { file: onResolveComponent ? onResolveComponent(component) : component } : {}),
    parentId,
    id,
  };
  if (absPath) {
    memo.ret[id].absPath = absPath;
  }
  if (routes) {
    transformRoutes({
      routes,
      parentId: id,
      memo,
      onResolveComponent,
    });
  }
  return { id };
}



function endsWithStar(str: string) {
  return str.endsWith('*');
}

function ensureWithSlash(left: string, right: string) {
  // right path maybe empty
  if (!right?.length || right === '/') {
    return left;
  }
  return `${left.replace(/\/+$/, '')}/${right.replace(/^\/+/, '')}`;
}