'use strict';
/* Pour queue scheduling rule (pure). A queued pour may start when neither of
   its bottles is claimed by a running pour or by an earlier queued pour. That
   keeps every bottle's pours in commit order and lets independent pours run
   side by side. `running` and `queue` hold objects with `si` / `di`.
   Returns the indices (into `queue`) that may start now, in order. */
function startablePours(running, queue) {
  const claimed = new Set();
  for (const r of running) { claimed.add(r.si); claimed.add(r.di); }
  const out = [];
  queue.forEach((q, k) => {
    if (!claimed.has(q.si) && !claimed.has(q.di)) out.push(k);
    claimed.add(q.si); claimed.add(q.di);
  });
  return out;
}
export { startablePours };
