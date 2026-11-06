import { AsyncLocalStorage, createHook } from 'node:async_hooks'
import { GlideClient } from '@valkey/valkey-glide'

const createClient = GlideClient.createClient

type ClientConfig = Parameters<typeof GlideClient.createClient>[0]
type PipeLifetime = ReturnType<typeof Promise.withResolvers<void>>

/** Own actual Glide clients and await their Unix pipe destruction, rather than only socket.end(). */
export class TestGlideClientScope {
  #creation = new AsyncLocalStorage<PipeLifetime[]>()
  #pipes = new Map<number, PipeLifetime>()
  #clients = new Map<GlideClient, PipeLifetime[]>()
  #owned = new Map<GlideClient, readonly string[] | undefined>()
  #failedPipes: PipeLifetime[] = []
  #hook = createHook({
    init: (id, type) => {
      const owner = this.#creation.getStore()
      if (type !== 'PIPEWRAP' || !owner) return
      const pipe = Promise.withResolvers<void>()
      owner.push(pipe)
      this.#pipes.set(id, pipe)
    },
    destroy: id => {
      this.#pipes.get(id)?.resolve()
      this.#pipes.delete(id)
    },
  })

  constructor() {
    this.#hook.enable()
  }

  get size(): number {
    return this.#owned.size
  }

  async create(config: ClientConfig): Promise<GlideClient> {
    const pipes: PipeLifetime[] = []
    try {
      const client = await this.#creation.run(pipes, () => createClient.call(GlideClient, config))
      this.#clients.set(client, pipes)
      if (pipes.length !== 1) {
        client.close()
        throw new Error('Owned Glide client must create exactly one Unix pipe')
      }
      return client
    } catch (err) {
      this.#failedPipes.push(...pipes)
      throw err
    }
  }

  own(client: GlideClient, patterns?: readonly string[]): void {
    if (!this.#clients.has(client))
      throw new Error('Cannot own a client created outside this scope')
    if (!this.#owned.has(client) || patterns) this.#owned.set(client, patterns)
  }

  async close(): Promise<void> {
    try {
      const results = await Promise.allSettled([
        ...[...this.#owned].map(async ([client, patterns]) => {
          try {
            if (patterns) await client.punsubscribe(new Set(patterns), 5000)
          } finally {
            client.close()
            await Promise.all(this.#clients.get(client)!.map(pipe => pipe.promise))
          }
        }),
        Promise.all(this.#failedPipes.map(pipe => pipe.promise)),
      ])
      const errors = results.flatMap(result =>
        result.status === 'rejected' ? [result.reason] : [],
      )
      if (errors.length > 0) throw new AggregateError(errors, 'Owned Glide clients did not close')
    } finally {
      this.#hook.disable()
      this.#creation.disable()
    }
  }
}
