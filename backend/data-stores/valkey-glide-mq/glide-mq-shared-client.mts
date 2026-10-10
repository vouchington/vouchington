import { setSharedCommandClientShutdown } from '@data-stores/valkey-core/glide-mq-registry'
import { createRetryingCommandClient } from './glide-mq-command-client.mts'

const sharedCommandClient = createRetryingCommandClient('worker-queue-command')

/** One multiplexed command connection shared by every queue, flow producer, and shared-client worker. */
export const workerQueueCommandClient = sharedCommandClient.client

setSharedCommandClientShutdown(sharedCommandClient.close)
