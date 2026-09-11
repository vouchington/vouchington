import { createQueue } from '@data-stores/valkey-glide-mq'
import { RSS_FEED_DISCOVERABILITY_QUEUE_NAME } from './config.mts'

export const rssFeedDiscoverability = createQueue(RSS_FEED_DISCOVERABILITY_QUEUE_NAME)
