import fs from "fs";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import { parse } from "@babel/parser";

export function babelTransformers(plugins) {
  return {
    name: "babel-transformers",
    /**
     * @param {import("esbuild").PluginBuild} build
     */
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

        const { code, map } = generate.default(ast, {
          sourceMaps: true,
        });
        return {
          contents:
            code +
            "//# sourceMappingURL=data:application/json;base64," +
            btoa(JSON.stringify(map)),
          loader: "ts",
        };
      });
    },
  };
}
