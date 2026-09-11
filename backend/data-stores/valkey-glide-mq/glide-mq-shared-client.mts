import { GlideClient } from '@glidemq/speedkey'
import { setSharedCommandClientShutdown } from '@data-stores/valkey-core/glide-mq-registry'
import { workerQueueConnection } from '@data-stores/valkey-core/glide-mq-client'
import { retryOnInflightSaturation } from './glide-mq-retry.mts'

type WorkerQueueCommandClient = Awaited<ReturnType<typeof GlideClient.createClient>>

let commandClient: WorkerQueueCommandClient | null = null
let commandClientPromise: Promise<WorkerQueueCommandClient> | null = null

export const workerQueueCommandClient = new Proxy({} as WorkerQueueCommandClient, {
  get(_target, property) {
    if (property === 'then') return undefined
    if (property === 'constructor') return GlideClient
    return (...args: unknown[]) =>
      retryOnInflightSaturation(
        () =>
          getRealCommandClient().then(client => {
            const value = client[property as keyof WorkerQueueCommandClient]
            return typeof value === 'function'
              ? (value as (...args: unknown[]) => unknown).apply(client, args)
              : value
          }),
        { command: String(property), client: 'worker-queue-command' },
      )
  },
})

setSharedCommandClientShutdown(async () => {
  const client = commandClient ?? (commandClientPromise ? await commandClientPromise : null)
  await Promise.resolve(client?.close())
})

function getRealCommandClient(): Promise<WorkerQueueCommandClient> {
  commandClientPromise ??= GlideClient.createClient({
    addresses: workerQueueConnection.addresses,
    ...(workerQueueConnection.useTLS ? { useTLS: true } : {}),
    ...(workerQueueConnection.credentials
      ? { credentials: workerQueueConnection.credentials }
      : {}),
    lazyConnect: true,
    requestTimeout: (() => {
      const parsed = parseInt(process.env.WORKER_QUEUE_REQUEST_TIMEOUT_MS ?? '', 10)
      return parsed > 0 ? parsed : 500
    })(),
    inflightRequestsLimit: (() => {
      const parsed = parseInt(process.env.WORKER_QUEUE_INFLIGHT_REQUESTS_LIMIT ?? '', 10)
      return parsed > 0 ? parsed : 1000
    })(),
  }).then(client => {
    commandClient = client
    return client
  })
  return commandClientPromise
}
