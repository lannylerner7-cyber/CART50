// Coalesce concurrent reads only. No TTL, persistent cache or stale fallback.
export class ReadFlight<T> {
  private pending?: Promise<T>;
  clear() { this.pending = undefined; }
  async read(load: () => Promise<T>): Promise<T> {
    if (!this.pending) {
      const pending = Promise.resolve().then(load);
      this.pending = pending;
      void pending.finally(() => {
        if (this.pending === pending) this.pending = undefined;
      }).catch(() => {});
    }
    return structuredClone(await this.pending);
  }
}
