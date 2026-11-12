import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const repository = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
export function externalPath(input) {
  const absolute = path.resolve(input);
  let ancestor = absolute;
  while (!existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw Error("External path unavailable");
    ancestor = parent;
  }
  const actual = path.resolve(realpathSync(ancestor), path.relative(ancestor, absolute));
  if (actual === repository || actual.startsWith(repository + path.sep))
    throw Error("Factory material must stay outside the repository");
  return actual;
}
