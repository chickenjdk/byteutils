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
            t.variableDeclaration("let", [
              t.variableDeclarator(
                t.identifier("current"),
                t.optionalMemberExpression(
                  t.identifier("instance"),
                  t.identifier("constructor"),
                  false,
                  true,
                ),
              ),
            ]),

            // const constructors = /* @__PURE__ */ new Set([current]);
            t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier("constructors"),
                t.newExpression(t.identifier("Set"), [
                  t.arrayExpression([t.identifier("current")]),
                ]),
              ),
            ]),

            // if (current === void 0) return;
            t.ifStatement(
              t.binaryExpression(
                "===",
                t.identifier("current"),
                t.unaryExpression("void", t.numericLiteral(0)),
              ),
              t.blockStatement([t.returnStatement()]),
            ),

            // while (current !== null)
            t.whileStatement(
              t.binaryExpression(
                "!==",
                t.identifier("current"),
                t.nullLiteral(),
              ),
              t.blockStatement([
                // current = Object.getPrototypeOf(current);
                t.expressionStatement(
                  t.assignmentExpression(
                    "=",
                    t.identifier("current"),
                    t.callExpression(
                      t.memberExpression(
                        t.identifier("Object"),
                        t.identifier("getPrototypeOf"),
                      ),
                      [t.identifier("current")],
                    ),
                  ),
                ),
                // constructors.add(current);
                t.expressionStatement(
                  t.callExpression(
                    t.memberExpression(
                      t.identifier("constructors"),
                      t.identifier("add"),
                    ),
                    [t.identifier("current")],
                  ),
                ),
              ]),
            ),

            // return Array.from(constructors).map(...).includes(${className}.____classID____);
            t.returnStatement(
              t.callExpression(
                t.memberExpression(
                  t.callExpression(
                    t.memberExpression(
                      t.callExpression(
                        t.memberExpression(
                          t.identifier("Array"),
                          t.identifier("from"),
                        ),
                        [t.identifier("constructors")],
                      ),
                      t.identifier("map"),
                    ),
                    [
                      t.arrowFunctionExpression(
                        [t.identifier("value")],
                        t.optionalMemberExpression(
                          t.identifier("value"),
                          t.identifier("____classID____"),
                          false,
                          true,
                        ),
                      ),
                    ],
                  ),
                  t.identifier("includes"),
                ),
                [
                  t.memberExpression(
                    t.identifier(className),
                    t.identifier("____classID____"),
                  ),
                ],
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
