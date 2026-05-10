import { buildIndividual } from "@chickenjdk/build";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { helperInlining } from "./helper-inlining.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(projectRoot, "src");
const distDir = resolve(projectRoot, "dist");

buildIndividual(srcDir, resolve(distDir, "esm"), {
  outputFormat: "esm",
  extraBabelPlugins: [helperInlining()],
});
buildIndividual(srcDir, resolve(distDir, "cjs"), {
  outputFormat: "cjs",
  extraBabelPlugins: [helperInlining()],
});
