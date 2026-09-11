import { createQueue } from '@data-stores/valkey-glide-mq'
import { CRAWL_URLS_QUEUE_NAME } from './config.mts'

export const crawlUrls = createQueue(CRAWL_URLS_QUEUE_NAME)
