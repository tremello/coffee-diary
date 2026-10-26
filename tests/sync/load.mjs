// Loads the app's TypeScript sync code in Node through Vite, the same compiler the app build uses.
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));

export async function loadSync() {
  const server = await createServer({
    root, configFile: false, logLevel: "silent", appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  const sync = await server.ssrLoadModule("/src/data/sync.ts");
  return { sync, close: () => server.close() };
}
