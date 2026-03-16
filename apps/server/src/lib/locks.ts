export class LockManager {
  private readonly active = new Map<string, Promise<unknown>>();

  async runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.active.get(key) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.active.set(key, previous.then(() => current));
    await previous;
    try {
      return await task();
    } finally {
      release?.();
      if (this.active.get(key) === current) {
        this.active.delete(key);
      }
    }
  }
}

