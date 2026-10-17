import { TwaManifest, TwaGenerator, ConsoleLog } from "@bubblewrap/core";
const [src, out] = process.argv.slice(2);
const m = await TwaManifest.fromFile(src);
await new TwaGenerator().createTwaProject(out, m, new ConsoleLog("gen"));
console.log("generated");
