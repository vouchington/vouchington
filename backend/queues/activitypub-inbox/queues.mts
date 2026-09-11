import { createQueue } from '@data-stores/valkey-glide-mq'
import { QUEUE_NAME } from './config.mts'

export const activitypubInbox = createQueue(QUEUE_NAME)
