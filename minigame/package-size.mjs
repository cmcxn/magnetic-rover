import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export async function checkPackage(directory) {
  const manifest = JSON.parse(
    await readFile(join(directory, "game.json"), "utf8"),
  );
  const packages = (manifest.subpackages || []).map(({ name, root }) => ({
    name,
    root: root.replace(/\/$/, "") + "/",
    bytes: 0,
  }));
  let mainBytes = 0;
  for (const file of await readdir(directory, { recursive: true })) {
    const details = await stat(join(directory, file));
    if (!details.isFile()) continue;
    const pack = packages.find(({ root }) => file.startsWith(root));
    if (pack) pack.bytes += details.size;
    else mainBytes += details.size;
  }
  if (mainBytes >= 4 * 1024 * 1024)
    throw new Error(
      `WeChat main package ${(mainBytes / 1024).toFixed(0)} KiB exceeds 4 MiB; move resources into a subpackage.`,
    );
  for (const pack of packages)
    await stat(join(directory, pack.root, "game.js"));
  const totalBytes = mainBytes + packages.reduce((n, p) => n + p.bytes, 0);
  console.log(
    `WeChat main: ${(mainBytes / 1024).toFixed(0)} KiB; total: ${(totalBytes / 1024).toFixed(0)} KiB`,
  );
  for (const pack of packages)
    console.log(`  ${pack.name}: ${(pack.bytes / 1024).toFixed(0)} KiB`);
  return { mainBytes, totalBytes, packages };
}
