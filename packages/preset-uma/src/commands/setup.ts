import { logger, rimraf } from '@umajs/utils';
import type { IApi, IOnGenerateFiles } from '../types';

export default (api: IApi) => {
  api.registerCommand({
    name: 'setup',
    description: 'setup project',
    async fn() {
      // clear tmp
      rimraf.sync(api.paths.absTmpPath);

      // generate tmp files
      logger.info('generate files');
      await api.applyPlugins({
        key: 'onGenerateFiles',
        args: {
          files: null,
          isFirstTime: true,
        } as IOnGenerateFiles,
      });
    },
  });
};
