// One cancellable job per client. Never fall back to blocking the UI thread.
export class WorkerClient {
  constructor(factory = () => new Worker(new URL('./puzzle-worker.js', import.meta.url), { type: 'module' })) { this.factory = factory; }
  cancel() { this.pending?.reject(new DOMException('Cancelled', 'AbortError')); }
  run(task, payload, timeout = 15000) {
    this.cancel();
    return new Promise((resolve, reject) => {
      let worker;
      try { worker = this.factory(); } catch { reject(new Error('Background processing is unavailable in this browser.')); return; }
      const finish = (fn, value) => {
        if (this.pending !== pending) return;
        clearTimeout(pending.timer); worker.terminate(); this.pending = null; fn(value);
      };
      const pending = { reject: error => finish(reject, error), timer: null };
      this.pending = pending;
      pending.timer = setTimeout(() => pending.reject(new Error('Search timed out. Try again or choose a smaller puzzle.')), timeout);
      worker.onmessage = ({data}) => data.error ? pending.reject(new Error(data.error)) : finish(resolve, data.result);
      worker.onerror = event => { event.preventDefault?.(); pending.reject(new Error('Background processing failed. Please try again.')); };
      try { worker.postMessage({ task, payload }); } catch (error) { pending.reject(error); }
    });
  }
}
