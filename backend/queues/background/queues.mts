import { createQueue } from '@data-stores/valkey-glide-mq'
import { BACKGROUND_QUEUE_NAME } from './config.mts'

export const background = createQueue(BACKGROUND_QUEUE_NAME, { priorityKind: 'ranked' })
