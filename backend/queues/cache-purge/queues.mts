import { createQueue } from '@data-stores/valkey-glide-mq'
import { QUEUE_NAME } from './config.mts'

export const cachePurge = createQueue(QUEUE_NAME)
