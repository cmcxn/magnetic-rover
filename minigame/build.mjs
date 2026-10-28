import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { checkPackage } from "./package-size.mjs";
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
execFileSync(process.execPath, ["--test", "minigame/tests/clock.test.mjs"], {
  stdio: "inherit",
});
const modules =
  process.env.ROVER_NODE_MODULES || resolve("client/node_modules");
const { build } = await import(
  pathToFileURL(resolve(modules, "esbuild/lib/main.js"))
);
// Only generated output lives here; rebuild cleanly so old assets never ship.
await rm("minigame/dist", { recursive: true, force: true });
await mkdir("minigame/dist", { recursive: true });
await cp("minigame/vendor/weapp-adapter.js", "minigame/dist/weapp-adapter.js");
await mkdir("minigame/dist/licenses", { recursive: true });
for (const name of ["weapp-adapter.LICENSE", "Phaser.LICENSE"])
  await cp(`minigame/vendor/${name}`, `minigame/dist/licenses/${name}`);
await cp("client/public/assets/cartoon", "minigame/dist/art/cartoon", {
  recursive: true,
});
await build({
  entryPoints: ["minigame/src/platform.js"],
  outfile: "minigame/dist/platform.js",
  bundle: true,
  format: "cjs",
  target: "es2017",
});
await build({
  entryPoints: ["minigame/src/main.ts"],
  nodePaths: [modules],
  outfile: "minigame/dist/main.js",
  bundle: true,
  format: "cjs",
  target: "es2017",
  minify: true,
  legalComments: "eof",
});
// The upload parser is older than the simulator: lower optional chaining too.
await build({
  entryPoints: ["minigame/src/boot.js"],
  outfile: "minigame/dist/game.js",
  bundle: false,
  format: "cjs",
  target: "es2017",
});
await writeFile("minigame/dist/art/game.js", "// Resource-only subpackage.\n");
await writeFile(
  "minigame/dist/game.json",
  JSON.stringify(
    {
      deviceOrientation: "landscape",
      showStatusBar: false,
      subpackages: [{ name: "art", root: "art/" }],
      networkTimeout: { connectSocket: 10000 },
    },
    null,
    2,
  ),
);
await checkPackage("minigame/dist");
console.log("Built minigame/dist (local validation only)");
