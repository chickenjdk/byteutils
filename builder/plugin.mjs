// knownHelpersPlugin.js
import fs from "node:fs/promises";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";

const COMMON_RE = /common(\.js)?$/;

/**
 * Lower the async helpers for performance
 * @returns {import("esbuild").Plugin}
 */
export function asyncHelperLowering() {
  return function (ast) {
    // Identifier -> helper kind
    const helpers = new Map();

    // Discover import
    traverse.default(ast, {
      ImportDeclaration(path) {
        if (!COMMON_RE.test(path.node.source.value)) return;

        for (const spec of path.node.specifiers) {
          if (!t.isImportSpecifier(spec)) continue;

          const imported = spec.imported.name;
          const local = spec.local.name;

          if (
            imported === "knownAsyncWhileLoop" ||
            imported === "knownPromiseThen" ||
            imported === "knownAsyncCallArr" ||
            imported === "wrapForKnownAsyncCallArr" ||
            imported === "wrapForPromiseKnown"
          ) {
            helpers.set(local, imported);
          }
        }
      },
    });

    if (helpers.size === 0) return null;

    const isInlineFn = (n) =>
      t.isArrowFunctionExpression(n) || t.isFunctionExpression(n);

    const iife = (body) =>
      t.callExpression(t.arrowFunctionExpression([], body), []);

    // Rewrite the calls!
    traverse.default(ast, {
      CallExpression(path) {
        if (!t.isIdentifier(path.node.callee)) return;

        const kind = helpers.get(path.node.callee.name);
        if (!kind) return;

        const args = path.node.arguments;

        if (kind === "knownPromiseThen") {
          const [value, callback, asyncFlag] = args;
          if (!isInlineFn(callback)) return;

          const valueId = t.identifier("__kpt_value");
          const param =
            callback.params[0] && t.isIdentifier(callback.params[0])
              ? callback.params[0].name
              : // If we don't have a param, put in a ton of underscores as the variable name so we can keep the function body the same (no one better use the same number of underscores in the code)
                "______";

          const bind = t.variableDeclaration("const", [
            t.variableDeclarator(t.identifier(param), valueId),
          ]);

          const syncBody = t.isBlockStatement(callback.body)
            ? [bind, ...callback.body.body]
            : [bind, t.returnStatement(callback.body)];

          const asyncThen = t.callExpression(
            t.memberExpression(valueId, t.identifier("then")),
            [callback],
          );

          path.replaceWith(
            iife(
              t.blockStatement([
                t.variableDeclaration("const", [
                  t.variableDeclarator(valueId, value),
                ]),
                t.ifStatement(
                  asyncFlag,
                  t.blockStatement([t.returnStatement(asyncThen)]),
                  t.blockStatement(syncBody),
                ),
              ]),
            ),
          );
        } else if (kind === "wrapForPromiseKnown") {
          const [awaiter, value, asyncFlag] = args;

          const awaiterId = t.identifier("__wpk_await");
          const valueId = t.identifier("__wpk_value");

          path.replaceWith(
            iife(
              t.blockStatement([
                t.variableDeclaration("const", [
                  t.variableDeclarator(awaiterId, awaiter),
                  t.variableDeclarator(valueId, value),
                ]),
                t.ifStatement(
                  asyncFlag,
                  t.blockStatement([
                    t.returnStatement(
                      t.callExpression(
                        t.memberExpression(awaiterId, t.identifier("then")),
                        [t.arrowFunctionExpression([], valueId)],
                      ),
                    ),
                  ]),
                  t.blockStatement([t.returnStatement(valueId)]),
                ),
              ]),
            ),
          );
        } else if (kind === "knownAsyncCallArr") {
          const [fn, params, asyncFlag] = args;

          const fnId = t.identifier("__kaca_fn");
          const paramsId = t.identifier("__kaca_params");
          const outId = t.identifier("__kaca_out");
          const iId = t.identifier("__kaca_i");

          const loopCall = (awaited) =>
            t.forStatement(
              t.variableDeclaration("let", [
                t.variableDeclarator(iId, t.numericLiteral(0)),
              ]),
              t.binaryExpression(
                "<",
                iId,
                t.memberExpression(paramsId, t.identifier("length")),
              ),
              t.updateExpression("++", iId),
              t.blockStatement([
                t.expressionStatement(
                  t.assignmentExpression(
                    "=",
                    t.memberExpression(outId, iId, true),
                    awaited
                      ? t.awaitExpression(
                          t.callExpression(fnId, [
                            t.spreadElement(
                              t.memberExpression(paramsId, iId, true),
                            ),
                          ]),
                        )
                      : t.callExpression(fnId, [
                          t.spreadElement(
                            t.memberExpression(paramsId, iId, true),
                          ),
                        ]),
                  ),
                ),
              ]),
            );

          path.replaceWith(
            iife(
              t.blockStatement([
                t.variableDeclaration("const", [
                  t.variableDeclarator(fnId, fn),
                  t.variableDeclarator(paramsId, params),
                ]),
                t.variableDeclaration("const", [
                  t.variableDeclarator(
                    outId,
                    t.newExpression(t.identifier("Array"), [
                      t.memberExpression(paramsId, t.identifier("length")),
                    ]),
                  ),
                ]),
                t.ifStatement(
                  asyncFlag,
                  t.blockStatement([
                    t.returnStatement(
                      t.callExpression(
                        t.arrowFunctionExpression(
                          [],
                          t.blockStatement([
                            loopCall(true),
                            t.returnStatement(outId),
                          ]),
                          true,
                        ),
                        [],
                      ),
                    ),
                  ]),
                  t.blockStatement([loopCall(false), t.returnStatement(outId)]),
                ),
              ]),
            ),
          );
        } else if (kind === "wrapForKnownAsyncCallArr") {
          const [fn, params, output, asyncFlag] = args;

          const fnId = t.identifier("__kaca_fn");
          const paramsId = t.identifier("__kaca_params");
          const outId = t.identifier(output.name);
          const iId = t.identifier("__kaca_i");

          const loopCall = (awaited) =>
            t.forStatement(
              t.variableDeclaration("let", [
                t.variableDeclarator(iId, t.numericLiteral(0)),
              ]),
              t.binaryExpression(
                "<",
                iId,
                t.memberExpression(paramsId, t.identifier("length")),
              ),
              t.updateExpression("++", iId),
              t.blockStatement([
                t.expressionStatement(
                  awaited
                    ? t.awaitExpression(
                        t.callExpression(fnId, [
                          t.spreadElement(
                            t.memberExpression(paramsId, iId, true),
                          ),
                        ]),
                      )
                    : t.callExpression(fnId, [
                        t.spreadElement(
                          t.memberExpression(paramsId, iId, true),
                        ),
                      ]),
                ),
              ]),
            );

          path.replaceWith(
            iife(
              t.blockStatement([
                t.variableDeclaration("const", [
                  t.variableDeclarator(fnId, fn),
                  t.variableDeclarator(paramsId, params),
                ]),
                t.ifStatement(
                  asyncFlag,
                  t.blockStatement([
                    t.returnStatement(
                      t.callExpression(
                        t.arrowFunctionExpression(
                          [],
                          t.blockStatement([
                            loopCall(true),
                            t.returnStatement(outId),
                          ]),
                          true,
                        ),
                        [],
                      ),
                    ),
                  ]),
                  t.blockStatement([loopCall(false), t.returnStatement(outId)]),
                ),
              ]),
            ),
          );
        } else if (kind === "knownAsyncWhileLoop") {
          const [callback, condition, asyncFlag] = args;

          const buildWhile = (bodyExpr) =>
            t.whileStatement(condition.body, t.blockStatement(bodyExpr));

          const syncBody = t.isBlockStatement(callback.body)
            ? callback.body.body
            : [t.expressionStatement(callback.body)];

          const asyncExpr = t.awaitExpression(
            t.isBlockStatement(callback.body)
              ? t.callExpression(
                  t.arrowFunctionExpression([], callback.body, true),
                  [],
                )
              : callback.body,
          );

          const asyncLoop = t.callExpression(
            t.arrowFunctionExpression(
              [],
              t.blockStatement([
                buildWhile([t.expressionStatement(asyncExpr)]),
              ]),
              true,
            ),
            [],
          );

          const replacement = t.callExpression(
            t.arrowFunctionExpression(
              [],
              t.blockStatement([
                t.ifStatement(
                  asyncFlag,
                  t.blockStatement([t.returnStatement(asyncLoop)]),
                  t.blockStatement([buildWhile(syncBody)]),
                ),
              ]),
            ),
            [],
          );

          path.replaceWith(replacement);
        }
      },
    });
  };
}
