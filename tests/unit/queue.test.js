import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AlbumQueue, Scheduler } from '../../src/downloader/queue.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

test('AlbumQueue runs items sequentially', async () => {
  const order = [];
  const queue = new AlbumQueue();
  queue.add(async () => { order.push('a-start'); await sleep(10); order.push('a-end'); });
  queue.add(async () => { order.push('b-start'); await sleep(10); order.push('b-end'); });
  await queue.done();
  assert.deepEqual(order, ['a-start', 'a-end', 'b-start', 'b-end']);
});

test('Scheduler runs at most 2 albums in parallel', async () => {
  const active = { current: 0, max: 0 };
  const sched = new Scheduler(2);

  async function makeAlbum(label) {
    return sched.runAlbum(async () => {
      active.current++;
      active.max = Math.max(active.max, active.current);
      await sleep(20);
      active.current--;
      return label;
    });
  }

  const results = await Promise.all([makeAlbum('x'), makeAlbum('y'), makeAlbum('z')]);
  assert.deepEqual(results.sort(), ['x', 'y', 'z']);
  assert.equal(active.max, 2);
});
