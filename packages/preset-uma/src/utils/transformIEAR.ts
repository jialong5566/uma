import { isDepPath } from "@umajs/bundler-utils";
import { winPath } from "@umajs/utils";
import { dirname, relative } from "path";
import type { IApi } from "../types";

export const IEAR_REG_EXP = new RegExp(
    [
      // match content before quote ($1)
      '(',
      [
        // import/export statements
        [
          '(?:',
          // match head
          '(?:^|\\r|\\n|;)\\s*',
          // match identifier
          '(?:import|export)\\s+',
          [
            '(?:',
            '(?:',
            // match body
            [
              // match default & member import
              [
                // match default import
                [
                  '(?:',
                  // match type import
                  '(?:type\\s*)?',
                  // match variable name
                  '[a-zA-Z_$][\\w_$]*\\s*,?\\s+',
                  // optional
                  ')?',
                ].join(''),
                // match member import/export (optional)
                '(?:{[^}]+}\\s+)?',
              ].join(''),
              // match contents import/export
              '(?:type\\s*)?\\*\\s+(?:as\\s+[a-zA-Z][\\w_$]*\\s+)?',
            ].join('|'),
            ')',
            // match from
            'from\\s+',
            // match direct file import
            '|\\s*',
            ')',
          ].join(''),
          ')',
        ].join(''),
        // import/require call
        [
          // match head (must be single function name)
          '(?:^|[^a-zA-Z\\w_$\\.])',
          // match call
          '(?:import|require)\\(\\s*',
        ].join(''),
      ].join('|'),
      ')',
      '(?:',
      // match quotes ($2)
      `('|")`,
      // match absolute file path ($3)
      `(\\/.*[^\\\\])\\2`,
      ')',
    ].join(''),
    // match full-content
    'g',
);

export default function transformIEAR(
    { content, path }: { content: string; path: string },
    api: IApi,
) {
  return content.replace(IEAR_REG_EXP, (_, prefix, quote, absPath) => {
    if (absPath.startsWith(api.paths.absTmpPath)) {
      // transform .umi absolute imports
      absPath = winPath(relative(dirname(path), absPath)).replace(
          // prepend ./ for same or sub level imports
          /^(?!\.\.\/)/,
          './',
      );
    } else if (isDepPath(absPath)) {
      // transform node_modules absolute imports
      // why @fs
      // 由于我们临时文件下大量绝对路径的引用，而绝对路径的引用不会被 Vite 预编译
      // 增加@fs后绝对路径会导致ts 提示失效, 这里转为相对路径解决
      absPath = `@fs/${winPath(relative(api.cwd, absPath))}`;
    }

    return `${prefix}${quote}${absPath}${quote}`;
  });
}