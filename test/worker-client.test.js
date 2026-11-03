import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerClient } from '../src/worker-client.js';
const mock = () => ({ postMessage() {}, terminate() { this.terminated = true; } });
test('replacement rejects old job and ignores late worker results', async () => {
  const workers = [], client = new WorkerClient(() => { const w = mock(); workers.push(w); return w; });
  const a = client.run('solve', {}), rejected = assert.rejects(a, {name:'AbortError'});
  const b = client.run('solve', {});
  workers[0].onmessage({data:{result:'stale'}});
  assert.equal(workers[0].terminated, true);
  workers[1].onmessage({data:{result:'current'}});
  assert.equal(await b, 'current'); await rejected;
  assert.equal(workers[1].terminated, true);
});
test('deadline terminates worker and returns control instead of blocking fallback', async () => {
  const worker = mock(), client = new WorkerClient(() => worker);
  await assert.rejects(client.run('solve', {}, 5), /timed out/);
  assert.equal(worker.terminated, true);
});
test('unavailable workers reject with a recoverable error', async () => {
  const client = new WorkerClient(() => { throw new Error('blocked'); });
  await assert.rejects(client.run('generate', {}), /unavailable/);
});
