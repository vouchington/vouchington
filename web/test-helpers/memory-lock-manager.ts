/** In-memory Web Locks fake that serializes callbacks per lock name. */
export class MemoryLockManager {
  readonly #tails = new Map<string, Promise<void>>()

  async request<T>(name: string, callback: () => Promise<T> | T): Promise<T> {
    const previous = this.#tails.get(name) ?? Promise.resolve()
    let release!: () => void
    const tail = new Promise<void>(resolve => {
      release = resolve
    })
    this.#tails.set(name, tail)
    await previous
    try {
      return await callback()
    } finally {
      release()
      if (this.#tails.get(name) === tail) this.#tails.delete(name)
    }
  }
}
