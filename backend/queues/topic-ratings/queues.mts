import { createQueue } from '@data-stores/valkey-glide-mq'
import { TOPIC_RATINGS_QUEUE_NAME } from './config.mts'

export const topicRatings = createQueue(TOPIC_RATINGS_QUEUE_NAME)
