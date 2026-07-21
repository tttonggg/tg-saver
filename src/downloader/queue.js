// src/downloader/queue.js
// Per-album queue (sequential) + scheduler (max-N parallel albums).

/** A queue of tasks that run one at a time, in insertion order. */
export class AlbumQueue {
  constructor() {
    /** @type {Array<() => Promise<unknown>>} */
    this._tasks = [];
    this._running = false;
    this._done = null;
    this._resolveDone = null;
  }

  /** @param {() => Promise<unknown>} task */
  add(task) {
    this._tasks.push(task);
    this._pump();
  }

  /** Resolves when all currently-added tasks have completed. */
  done() {
    if (!this._running && this._tasks.length === 0) return Promise.resolve();
    if (!this._done) this._done = new Promise((resolve) => { this._resolveDone = resolve; });
    return this._done;
  }

  _pump() {
    if (this._running) return;
    const task = this._tasks.shift();
    if (!task) {
      if (this._resolveDone) this._resolveDone();
      this._done = null;
      this._resolveDone = null;
      return;
    }
    this._running = true;
    Promise.resolve()
      .then(() => task())
      .catch(() => {})
      .finally(() => {
        this._running = false;
        this._pump();
      });
  }
}

/** Limits how many AlbumQueues can run concurrently. */
export class Scheduler {
  constructor(maxParallel = 2) {
    this.maxParallel = maxParallel;
    this._active = 0;
    /** @type {Array<() => void>} */
    this._waiting = [];
  }

  /**
   * @param {() => Promise<T>} run
   * @returns {Promise<T>}
   * @template T
   */
  runAlbum(run) {
    return new Promise((resolve, reject) => {
      const start = () => {
        this._active++;
        Promise.resolve().then(run).then(resolve, reject).finally(() => {
          this._active--;
          const next = this._waiting.shift();
          if (next) next();
        });
      };
      if (this._active < this.maxParallel) start();
      else this._waiting.push(start);
    });
  }
}
