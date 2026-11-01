import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
// Rebuild the CC0 Aston Martin recording edit, never overwrite it with synthesis.
execFileSync("python3", [fileURLToPath(new URL("../art/audio/aston-martin/edit.py", import.meta.url))], {stdio:"inherit"});
