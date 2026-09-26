'use strict';
/* Instant-commit queue scheduling rule (src/pour-queue.js). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startablePours } from '../src/pour-queue.js';

const P = (si, di) => ({ si, di });

test('an empty board starts the first pour', () => {
  assert.deepEqual(startablePours([], [P(0, 1)]), [0]);
});

test('independent pours start together', () => {
  assert.deepEqual(startablePours([], [P(0, 1), P(2, 3), P(4, 5)]), [0, 1, 2]);
});

test('a pour waits while either of its bottles is running', () => {
  assert.deepEqual(startablePours([P(0, 1)], [P(1, 2), P(3, 0), P(4, 5)]), [2]);
});

test('per-bottle order is kept: a later pour never overtakes an earlier queued one', () => {
  /* q0 is blocked by the running pour on bottle 1; q1 shares bottle 2 with q0,
     so it must wait too even though nothing running touches it */
  assert.deepEqual(startablePours([P(0, 1)], [P(1, 2), P(2, 3)]), []);
});

test('chains release one link at a time', () => {
  let running = [], queue = [P(0, 1), P(1, 2), P(2, 3)];
  const order = [];
  while (queue.length) {
    const k = startablePours(running, queue);
    assert.equal(k.length, 1);
    order.push(queue[k[0]]); running = [queue[k[0]]];
    queue = queue.filter((q, i) => i !== k[0]);
    running = [];                  /* it finishes before the next pump */
  }
  assert.deepEqual(order, [P(0, 1), P(1, 2), P(2, 3)]);
});
