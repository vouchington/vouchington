import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'

export const realGlideConnection = {
  connection: workerQueueConnection,
  prefix: workerQueuePrefix,
}
