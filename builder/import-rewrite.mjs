import traverse from "@babel/traverse";

export function importRewritePlugin(options = {}) {
  const { fileType } = options;
  return function (ast) {
    traverse.default(ast, {
      ImportDeclaration(path) {
        const val = path.node.source.value;
        if (val.endsWith(".js")) {
          path.node.source.value = val.replace(/\.js$/, fileType);
        }
      },
      ExportAllDeclaration(path) {
        const val = path.node.source.value;
        if (val && val.endsWith(".js")) {
          path.node.source.value = val.replace(/\.js$/, fileType);
        }
      },
      ExportNamedDeclaration(path) {
        const val = path.node.source?.value;
        if (val && val.endsWith(".js")) {
          path.node.source.value = val.replace(/\.js$/, fileType);
        }
      },
      CallExpression(path) {
        const callee = path.get("callee");

        if (
          callee.isIdentifier({ name: "require" }) &&
          path.node.arguments.length === 1
        ) {
          const arg = path.node.arguments[0];
          if (arg.type === "StringLiteral" && arg.value.endsWith(".js")) {
            arg.value = arg.value.replace(/\.js$/, fileType);
          }
        }
      },
      Import(path) {
        // handles dynamic import()
        const parent = path.parent;
        if (parent.arguments && parent.arguments.length === 1) {
          const arg = parent.arguments[0];
          if (arg.type === "StringLiteral" && arg.value.endsWith(".js")) {
            arg.value = arg.value.replace(/\.js$/, fileType);
          }
        }
      },
    });
  };
}
