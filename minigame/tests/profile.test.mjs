import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "../../client/node_modules/typescript/lib/typescript.js";
import { COLORS } from "../../client/src/types.ts";
const source = fs.readFileSync(
  new URL("../src/main.ts", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "main.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);
const fn = ast.statements.find(
  (s) => ts.isFunctionDeclaration(s) && s.name?.text === "rememberProfile",
);
const compiled = ts.transpileModule(fn.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
test("WeChat confirmed nickname and preferred color persist in device storage", () => {
  const saved = new Map();
  const ctx = { COLORS, wx: { setStorageSync: (k, v) => saved.set(k, v) } };
  vm.createContext(ctx);
  vm.runInContext(
    'let name="Old",color=COLORS[0];' +
      compiled +
      ';rememberProfile({name:"新车手",color:COLORS[6]});',
    ctx,
  );
  assert.equal(saved.get("rover.name"), "新车手");
  assert.equal(saved.get("rover.spike.name"), "新车手");
  assert.equal(saved.get("rover.color"), COLORS[6]);
  vm.runInContext('rememberProfile({name:"再次改名",color:"invalid"});', ctx);
  assert.equal(saved.get("rover.name"), "再次改名");
  assert.equal(saved.get("rover.color"), COLORS[6]);
});
