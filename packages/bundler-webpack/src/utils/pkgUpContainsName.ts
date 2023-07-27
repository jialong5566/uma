import { pkgUp } from "@umajs/utils";
import path from 'path';

export function pkgUpContainsName(file: string): string|null {
  let pkgPth = pkgUp.pkgUpSync({ cwd: file });
  if(!pkgPth){
    return null;
  }
  const { name } = require(pkgPth);
  if(!name){
    return pkgUpContainsName(path.resolve(pkgPth, "../.."))
  }
  return pkgPth;
}