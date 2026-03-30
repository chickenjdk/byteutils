import * as esbuild from "esbuild";
import { asyncHelperLowering } from "./plugin.mjs";
import { readdirSync, statSync } from "fs";
import { join } from "path";

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
  plugins: [asyncHelperLowering(), noUtilPlugin],
  format: "iife",
  sourcemap: "linked",
});

esbuild.build({
  minify: true,
  bundle: true,
  outfile: "./dist/bundles/bundle.esm.js",
  entryPoints: ["./src/index.ts"],
  plugins: [asyncHelperLowering(), noUtilPlugin],
  format: "esm",
  sourcemap: "linked",
});*/

esbuild.build({
  minify: false,
  bundle: false,
  outdir: "./dist/esm",
  entryPoints: readDirAll("./src"),
  plugins: [asyncHelperLowering()],
  format: "esm",
  sourcemap: "linked",
});

esbuild.build({
  minify: false,
  bundle: false,
  outdir: "./dist/cjs",
  entryPoints: readDirAll("./src"),
  plugins: [asyncHelperLowering()],
  format: "cjs",
  sourcemap: "linked",
});

console.log("Finished build!");
