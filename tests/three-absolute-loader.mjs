import path from "node:path";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("/node_modules/")) {
    return {
      shortCircuit: true,
      url: pathToFileURL(path.join(process.cwd(), specifier)).href,
    };
  }
  return nextResolve(specifier, context);
}
