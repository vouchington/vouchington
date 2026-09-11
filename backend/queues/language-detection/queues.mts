import { createQueue } from '@data-stores/valkey-glide-mq'
import { LANGUAGE_DETECTION_QUEUE_NAME } from './config.mts'

export const language_detection = createQueue(LANGUAGE_DETECTION_QUEUE_NAME)
