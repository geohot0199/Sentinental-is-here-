/**
 * Resolver hook for the conformance scripts.
 *
 * Next resolves `import "./tool-catalog"` to `tool-catalog.ts`; plain Node ESM
 * does not, so without this the harness could not import the browser-side
 * modules it needs to exercise. Extensionless relative specifiers are tried as
 * .ts, .tsx, .js and index.ts — the same order the bundler uses.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, next) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (isRelative && context.parentURL?.startsWith("file:") && !/\.[a-z]+$/i.test(specifier)) {
    const dir = path.dirname(fileURLToPath(context.parentURL));
    for (const extension of [".ts", ".tsx", ".js", "/index.ts"]) {
      const candidate = path.join(dir, specifier + extension);
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }
  return next(specifier, context);
}
