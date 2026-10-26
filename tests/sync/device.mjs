// One "device": its own localStorage and its own copy of the sync module, run in a worker thread
// so that two devices really do sync independently against the shared fake server.
import { parentPort, workerData } from "node:worker_threads";
import { loadSync } from "./load.mjs";

const store = new Map();
const methods = {
  getItem: key => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: key => { store.delete(key); },
  clear: () => store.clear(),
};
// Like the browser's, Object.keys(localStorage) lists the stored keys; the app relies on that.
globalThis.localStorage = new Proxy({}, {
  get: (_, name) => name === "length" ? store.size : methods[name] ?? store.get(name),
  ownKeys: () => [...store.keys()],
  getOwnPropertyDescriptor: (_, name) => store.has(name) ? { value: store.get(name), enumerable: true, configurable: true } : undefined,
});

// Send the app's Supabase requests to the fake server instead of the real project.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  return realFetch(workerData.origin + url.pathname + url.search, init);
};

const { sync } = await loadSync();
const read = key => { const s = localStorage.getItem(key); return s ? JSON.parse(s) : undefined; };
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const commands = {
  // The device has already loaded `value` from the server for this account.
  start({ key, userId, value }) {
    write("cf_owner", userId);
    write(key, value);
    write(sync.BASE_PREFIX + key, value);
    sync.keySync(key).readyFor = userId;
  },
  // Same as an edit in the app: save locally, then push (merging with the server copy first).
  async edit({ key, userId, value }) {
    write(key, value);
    await sync.pushKey(key, userId);
  },
  // Same as coming back to the tab: pull the server copy if nothing is waiting to be sent.
  async refresh({ key, userId }) {
    sync.keySync(key).lastRefresh = 0;
    await sync.refreshKey(key, userId);
  },
  local: ({ key }) => read(key),
  pending: ({ key }) => read("cf_pending:" + key) !== undefined,
};

parentPort.on("message", async ({ id, command, args }) => {
  try { parentPort.postMessage({ id, result: await commands[command](args) }); }
  catch (error) { parentPort.postMessage({ id, error: String(error?.stack ?? error) }); }
});
parentPort.postMessage({ ready: true });
