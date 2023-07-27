import Config from '../../compiled/webpack-5-chain';
import { winPath } from '@umajs/utils';
import type { LoaderContext } from 'mini-css-extract-plugin/types/utils';
import { Env, IConfig } from '../types';


interface IOpts {
  config: Config;
  userConfig: IConfig;
  cwd: string;
  env: Env;
  browsers: any;
}

export async function addCSSRules(opts: IOpts){
  const { config, userConfig } = opts;

  const rulesConfig = [
    { name: 'css', test: /\.css(\?.*)?$/ },
    {
      name: 'less',
      test: /\.less(\?.*)?$/,
      loader: require.resolve('@umajs/bundler-webpack/compiled/less-loader'),
      loaderOptions: {
        implementation: require.resolve('@umajs/bundler-utils/compiled/less'),
        lessOptions: {
          modifyVars: userConfig.theme,
          javascriptEnabled: true,
          ...userConfig.lessLoader,
        },
      }
    }
  ];

  for (const { name, test } of rulesConfig) {
    const rule = config.module.rule(name);
    const nestRulesConfig = [
      userConfig.autoCSSModules && {
        rule: rule.test(test)
            .oneOf('css-modules')
            .resourceQuery(/modules/),
        isAutoCSSModuleRule: true,
      },
      {
        rule: rule.test(test).oneOf('css').sideEffects(true),
        isAutoCSSModuleRule: false,
      },
    ].filter(Boolean);
    // @ts-ignore
    for (const { rule, isAutoCSSModuleRule } of nestRulesConfig) {
      if (userConfig.styleLoader) {
        rule
            .use('style-loader')
            .loader(
                require.resolve('@umajs/bundler-webpack/compiled/style-loader'),
            )
            .options({ base: 0, esModule: true, ...userConfig.styleLoader });
      }
      else {
        rule
          .use('mini-css-extract-plugin')
          .loader(
              require.resolve(
                  '@umajs/bundler-webpack/compiled/mini-css-extract-plugin/loader',
              ),
          )
          .options({
            publicPath: './',
            emit: true,
            esModule: true,
          });

        const getLocalIdent = userConfig.ssr && getLocalIdentForSSR;
        const localIdentName = '[local]___[hash:base64:5]';

        let cssLoaderModulesConfig: any;
        if (isAutoCSSModuleRule) {
          cssLoaderModulesConfig = {
            localIdentName,
            ...userConfig.cssLoaderModules,
            getLocalIdent,
          };
        } else if (userConfig.normalCSSLoaderModules) {
          cssLoaderModulesConfig = {
            localIdentName,
            auto: true,
            ...userConfig.normalCSSLoaderModules,
            getLocalIdent,
          };
        }
        rule
            .use('css-loader')
            .loader(require.resolve('css-loader'))
            .options({
              importLoaders: 1,
              esModule: true,
              url: {
                filter: (url: string) => {
                  // Don't parse absolute URLs
                  // ref: https://github.com/webpack-contrib/css-loader#url
                  if (url.startsWith('/')) return false;
                  return true;
                },
              },
              import: true,
              modules: cssLoaderModulesConfig,
              ...userConfig.cssLoader,
            });
      }
    }
  }
}

function ensureLastSlash(path: string) {
  return path.endsWith('/') ? path : path + '/';
}

function getLocalIdentForSSR(
    context: LoaderContext,
    localIdentName: string,
    localName: string,
    opt: any,
) {
  const classIdent = (
      winPath(context.resourcePath).replace(
          winPath(ensureLastSlash(opt.context)),
          '',
      ) +
      '@' +
      localName
  ).trim();
  let hash = Buffer.from(classIdent).toString('base64').replace(/=/g, '');
  hash = hash.substring(hash.length - 5);
  const result = localIdentName
      .replace(/\[local]/g, localName)
      .replace(/\[hash[^\[]*?]/g, hash);
  return result;
}