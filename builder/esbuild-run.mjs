import * as esbuild from "esbuild";
import { helperInlining } from "./helper-inlining.mjs";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { classIdPlugin } from "./classid.mjs";
import { importRewritePlugin } from "./import-rewrite.mjs";
import { babelTransformers } from "./babel-transformers.mjs";

const noUtilPlugin = {
  name: "util-blackhole",
  setup(build) {
    // Step 1: intercept imports
    build.onResolve({ filter: /^util$/ }, (args) => {
      return { path: args.path, namespace: "util-blackhole" };
    });

    // Step 2: provide the polyfill code
    build.onLoad({ filter: /.*/, namespace: "util-blackhole" }, () => {
      return {
        contents: ``,
        loader: "js",
      };
    });
  },
};

function readDirAll(path) {
  const items = readdirSync(path);
  const results = [];
  for (const item of items) {
    const itemPath = join(path, item);
    if (statSync(itemPath).isDirectory()) {
      results.push(...readDirAll(itemPath));
    } else {
      results.push(itemPath);
    }
  }
  return results;
}

/*esbuild.build({
  minify: true,
  bundle: true,
  outfile: "./dist/bundles/bundle.iife.js",
  entryPoints: ["./src/index.ts"],
  plugins: [
    babelTransformers([
      asyncHelperLowering(),
      classIdPlugin({ filesRoot: "./src" }),
    ]),
    noUtilPlugin,
  ],
  format: "iife",
  sourcemap: "linked",
});

esbuild.build({
  minify: true,
  bundle: true,
  outfile: "./dist/bundles/bundle.esm.js",
  entryPoints: ["./src/index.ts"],
  plugins: [
    babelTransformers([
      asyncHelperLowering(),
      classIdPlugin({ filesRoot: "./src" }),
    ]),
    noUtilPlugin,
  ],
  format: "esm",
  sourcemap: "linked",
});*/

esbuild.build({
  minify: false,
  bundle: false,
  outdir: "./dist/esm",
  entryPoints: readDirAll("./src"),
  plugins: [
    babelTransformers([
      importRewritePlugin({ fileType: ".mjs" }),
      helperInlining(),
      classIdPlugin({ filesRoot: "./src" }),
    ]),
  ],
  format: "esm",
  sourcemap: "linked",
  outExtension: { ".js": ".mjs" },
});

esbuild.build({
  minify: false,
  bundle: false,
  outdir: "./dist/cjs",
  entryPoints: readDirAll("./src"),
  plugins: [
    babelTransformers([
      importRewritePlugin({ fileType: ".cjs" }),
      helperInlining(),
      classIdPlugin({ filesRoot: "./src" }),
    ]),
  ],
  format: "cjs",
  sourcemap: "linked",
  outExtension: { ".js": ".cjs" },
});

console.log("Finished build!");
