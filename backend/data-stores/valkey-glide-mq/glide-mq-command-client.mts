import { GlideClient } from '@glidemq/speedkey'
import { createRetryingCommandClient as createCommandClient } from '@vouchington/worker-runtime/glide-mq'
import { workerQueueConnection } from '@data-stores/valkey-core/glide-mq-client'
import { retryOnInflightSaturation } from './glide-mq-retry.mts'

type WorkerQueueCommandClient = Awaited<ReturnType<typeof GlideClient.createClient>>

/**
 * Builds a lazily connected GLIDE command client for glide-mq, with the worker-queue request
 * timeout and inflight limit from the environment, wrapped so every command retries on
 * inflight-saturation errors. The shared factory client and each dedicated worker client use it,
 * so they cannot drift apart.
 */
export function createRetryingCommandClient(clientName: string) {
  return createCommandClient<WorkerQueueCommandClient>({
    name: clientName,
    clientConstructor: GlideClient,
    retry: retryOnInflightSaturation,
    connect: () =>
      GlideClient.createClient({
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
      }),
  })
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10)
  return parsed > 0 ? parsed : fallback
}
