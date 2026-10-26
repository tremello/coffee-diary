// Compiles the app's TypeScript sync code once with Vite (the app's own compiler) into a plain ES module.
// Devices import that file inside worker threads; Vite itself never runs in a worker, because its native
// parts crash the process when a worker that loaded them is stopped (seen on Node 24 / macOS).
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
let built;

export function buildSync() {
  built ??= (async () => {
    // Inside node_modules so the compiled file still finds react and supabase-js, and git ignores it.
    const outDir = join(root, "node_modules", ".cache", "coffee-sync-test");
    await build({
      root, configFile: false, logLevel: "silent",
      build: { ssr: "src/data/sync.ts", outDir, emptyOutDir: true, minify: false, copyPublicDir: false },
    });
    const file = (await readdir(outDir)).find(name => /\.m?js$/.test(name));
    return pathToFileURL(join(outDir, file)).href;
  })();
  return built;
}
