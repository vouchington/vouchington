import { createQueue } from '@data-stores/valkey-glide-mq'
import { IMAGES_QUEUE_NAME } from './config.mts'

export const imagesQueue = createQueue(IMAGES_QUEUE_NAME)
