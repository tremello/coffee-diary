import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readdir } from 'node:fs/promises';
import { build } from 'vite';
const root = fileURLToPath(new URL('../..', import.meta.url));
let pages;
before(async () => {
  const outDir = join(root, 'node_modules/.cache/coffee-link-test');
  await build({ root, configFile: false, logLevel: 'silent', build: { ssr: true, minify: false, copyPublicDir: false, outDir, emptyOutDir: true, rollupOptions: { input: 'src/lib/pages.ts' } } });
  const entry = (await readdir(outDir)).find(file => /\.m?js$/.test(file));
  pages = await import(pathToFileURL(join(outDir, entry)).href);
});
test('bean and brew IDs open the right tab without actions', () => {
  assert.equal(pages.pageFromHash('#beans?bean=123'), 'Beans');
  assert.equal(pages.readAppLink('#beans?bean=123').beanId, 123);
  const link = pages.readAppLink('#brews?brew=456&mode=edit&access_token=private');
  assert.equal(link.brewId, 456);
  assert.equal(pages.appLinkHash(link), '#brews?brew=456');
});
test('stats preserves exact period for Mac links and login round trips', () => {
  const hash = '#stats?from=2026-11-02&to=2026-11-05';
  assert.deepEqual(pages.readAppLink(hash).range, { from: '2026-11-02', to: '2026-11-05' });
  assert.equal(pages.appLinkHash(pages.readAppLink(hash)), hash);
});
test('malformed IDs and dates cannot become context', () => {
  for (const hash of ['#beans?bean=-1', '#beans?bean=1&bean=2', '#brews?brew=Infinity', '#beans?bean=9007199254740992', '#stats?from=2026-02-30&to=2026-03-05', '#stats?from=2026-11-05&to=2026-11-02', '#stats?from=2026-11-02', '#stats?from=2024-01-01&to=2026-11-05']) {
    assert.equal(pages.readAppLink(hash).invalid, true, hash);
  }
});
test('ordinary links retain existing behavior', () => {
  assert.equal(pages.pageFromHash('#recipes'), 'Recipes');
  assert.equal(pages.pageFromHash('#unknown'), 'Home');
  assert.equal(pages.appLinkHash(pages.readAppLink('#beans')), '#beans');
});
