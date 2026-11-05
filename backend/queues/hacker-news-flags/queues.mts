import { createQueue } from '@data-stores/valkey-glide-mq'
import type { HackerNewsFlagData } from './types.mts'
import { QUEUE_NAME } from './config.mts'
export const hackerNewsFlagsQueue = createQueue<HackerNewsFlagData>(QUEUE_NAME, {
  priorityKind: 'none',
})
