export enum Env {
  development = 'development',
  production = 'production',
  test = 'test',
}

export enum ServiceStage {
  uninitialized,
  init,
  initPresets,
  initPlugins,
  resolveConfig,
  collectAppData,
  onCheck,
  onStart,
  runCommand,
}

export interface IRoute {
  path: string;
  absPath: string;
  file: string;
  id: string;
  parentId?: string;
  [key: string]: any;
}