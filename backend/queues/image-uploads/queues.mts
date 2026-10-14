import { createQueue } from '@data-stores/valkey-glide-mq'
import { IMAGE_UPLOADS_QUEUE_NAME } from './config.mts'

export const imageUploadsQueue = createQueue(IMAGE_UPLOADS_QUEUE_NAME, { priorityKind: 'none' })
