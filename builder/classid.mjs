import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as t from "@babel/types";
import traverse from "@babel/traverse";

export function classIdPlugin(options = {}) {
  const { root = process.cwd(), filesRoot = root } = options;

  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );

  function createHash(filePath, className) {
    const rel = path.relative(filesRoot, filePath).replace(/\\/g, "/");

    const input = `${pkg.name}@${pkg.version}/${rel}.${className}`;

    return crypto.createHash("sha512").update(input).digest("hex");
  }

  return function (ast, args) {
    traverse.default(ast, {
      Class(pathNode) {
        const node = pathNode.node;

        // Only named classes
        let className = node.id?.name;

        if (!className) {
          // Handle: const A = class {}
          if (
            t.isVariableDeclarator(pathNode.parent) &&
            t.isIdentifier(pathNode.parent.id)
          ) {
            className = pathNode.parent.id.name;
          } else {
            return;
          }
        }

        const hash = createHash(args.path, className);

        // static ____classID____ = "..."
        const classIdProp = t.classProperty(
          t.identifier("____classID____"),
          t.stringLiteral(hash),
          null,
          null,
        );
        classIdProp.static = true;

        // static [Symbol.hasInstance](instance) { ... }
        const hasInstanceMethod = t.classMethod(
          "method",
          t.identifier("Symbol.hasInstance"),
          [t.identifier("instance")],
          t.blockStatement([
            t.returnStatement(
              t.binaryExpression(
                "===",
                t.optionalMemberExpression(
                  t.optionalMemberExpression(
                    t.identifier("instance"),
                    t.identifier("constructor"),
                    false,
                    true,
                  ),
                  t.identifier("____classID____"),
                  false,
                  true,
                ),
                t.memberExpression(
                  t.identifier(className),
                  t.identifier("____classID____"),
                ),
              ),
            ),
          ]),
        );

        hasInstanceMethod.static = true;
        hasInstanceMethod.computed = true;

        // Inject into class body
        node.body.body.unshift(hasInstanceMethod);
        node.body.body.unshift(classIdProp);
      },
    });
  };
}
