import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Derive the cache version from built content, including worker chunks and art.
function offlineBuild() {
  return {
    name: 'vessel-offline',
    closeBundle() {
      const root = resolve('dist');
      const files = readdirSync(root, { recursive: true, withFileTypes: true })
        .filter(e => e.isFile() && e.name !== 'sw.js')
        .map(e => resolve(e.parentPath, e.name)).sort();
      const hash = createHash('sha256');
      files.forEach(f => hash.update(readFileSync(f)));
      const cache = 'vessel-' + hash.digest('hex').slice(0, 16);
      const urls = files.map(f => '/' + f.slice(root.length + 1));
      writeFileSync(resolve(root, 'sw.js'), `
const CACHE = ${JSON.stringify(cache)};
const ASSETS = ${JSON.stringify(urls)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('message', event => { if (event.data === 'ACTIVATE') self.skipWaiting(); });
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('vessel-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') return (await cache.match('/index.html')) || fetch(event.request);
    return (await cache.match(event.request, { ignoreSearch: true, ignoreVary: true })) || fetch(event.request);
  })());
});
`);
    }
  };
}
export default defineConfig({ plugins: [offlineBuild()], build: { rollupOptions: { input: { main: resolve('index.html') } } } });
