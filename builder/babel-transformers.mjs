import fs from "fs";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import { parse } from "@babel/parser";

export function babelTransformers(plugins) {
  return {
    name: "babel-transformers",
    setup(build) {
      build.onLoad({ filter: /\.[tj]sx?$/ }, async (args) => {
        const source = await fs.promises.readFile(args.path, "utf8");

        const ast = parse(source, {
          sourceType: "module",
          plugins: ["typescript", "jsx"],
        });

        for (const plugin of plugins) {
          plugin(ast, args);
        }

        const { code } = generate.default(ast, {
          sourceMaps: false,
        });

        return { contents: code, loader: "ts" };
      });
    },
  };
}
