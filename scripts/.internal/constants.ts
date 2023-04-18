import { join } from 'path';

const ROOT = join(__dirname, '../../');

export const PATHS = {
  ROOT,
  PACKAGES: join(ROOT, './packages'),
} as const;