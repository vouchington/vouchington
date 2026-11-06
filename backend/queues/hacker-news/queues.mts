import type { HackerNewsLookupData } from './types.mts'
import { createQueue } from '@data-stores/valkey-glide-mq'
import { QUEUE_NAME } from './config.mts'

export const hackerNewsQueue = createQueue<HackerNewsLookupData>(QUEUE_NAME, {
  priorityKind: 'none',
})
