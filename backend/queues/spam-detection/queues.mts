import { createQueue } from '@data-stores/valkey-glide-mq'
import { SPAM_DETECTION_QUEUE_NAME } from './config.mts'

export const spam_detection = createQueue(SPAM_DETECTION_QUEUE_NAME)
