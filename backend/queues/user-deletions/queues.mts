import { createQueue } from '@data-stores/valkey-glide-mq'
import { USER_DELETIONS_QUEUE_NAME } from './config.mts'

export const userDeletions = createQueue(USER_DELETIONS_QUEUE_NAME)
