import { GlideClient } from '@glidemq/speedkey'
import { workerQueueConnection } from '@data-stores/valkey-core/glide-mq-client'
import { retryOnInflightSaturation } from './glide-mq-retry.mts'

type WorkerQueueCommandClient = Awaited<ReturnType<typeof GlideClient.createClient>>

export type RetryingCommandClient = {
  /** Lazily connected client whose commands retry on inflight-saturation errors. */
  client: WorkerQueueCommandClient
  /** Closes the real connection if one was opened. Safe to call more than once. */
  close(): Promise<void>
}

/**
 * Builds a lazily connected GLIDE command client for glide-mq, with the worker-queue request
 * timeout and inflight limit from the environment, wrapped so every command retries on
 * inflight-saturation errors. The shared factory client and each dedicated worker client use it,
 * so they cannot drift apart.
 */
export function createRetryingCommandClient(clientName: string): RetryingCommandClient {
  let commandClient: WorkerQueueCommandClient | null = null
  let commandClientPromise: Promise<WorkerQueueCommandClient> | null = null
  let closePromise: Promise<void> | null = null

  function getRealCommandClient(): Promise<WorkerQueueCommandClient> {
    commandClientPromise ??= GlideClient.createClient({
      addresses: workerQueueConnection.addresses,
      ...(workerQueueConnection.useTLS ? { useTLS: true } : {}),
      ...(workerQueueConnection.credentials
        ? { credentials: workerQueueConnection.credentials }
        : {}),
      lazyConnect: true,
      requestTimeout: parsePositiveInt(process.env.WORKER_QUEUE_REQUEST_TIMEOUT_MS, 500),
      inflightRequestsLimit: parsePositiveInt(
        process.env.WORKER_QUEUE_INFLIGHT_REQUESTS_LIMIT,
        1000,
      ),
    }).then(client => {
      commandClient = client
      return client
    })
    return commandClientPromise
  }

  const client = new Proxy({} as WorkerQueueCommandClient, {
    get(_target, property) {
      if (property === 'then') return undefined
      if (property === 'constructor') return GlideClient
      return (...args: unknown[]) =>
        retryOnInflightSaturation(
          () =>
            getRealCommandClient().then(real => {
              const value = real[property as keyof WorkerQueueCommandClient]
              return typeof value === 'function'
                ? (value as (...args: unknown[]) => unknown).apply(real, args)
                : value
            }),
          { command: String(property), client: clientName },
        )
    },
  })

  function close(): Promise<void> {
    closePromise ??= (async () => {
      const real = commandClient ?? (commandClientPromise ? await commandClientPromise : null)
      await Promise.resolve(real?.close())
    })()
    return closePromise
  }

  return { client, close }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10)
  return parsed > 0 ? parsed : fallback
}
