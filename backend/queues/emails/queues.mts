import { createQueue } from '@data-stores/valkey-glide-mq'
import { QUEUE_NAME } from './config.mts'

// Every job here is equally urgent, so the queue takes no priority and skips ranked promotion.
export const emails = createQueue(QUEUE_NAME, { priorityKind: 'none' })
