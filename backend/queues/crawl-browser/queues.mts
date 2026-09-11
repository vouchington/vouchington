import { createQueue } from '@data-stores/valkey-glide-mq'
import { CRAWL_BROWSER_QUEUE_NAME } from './config.mts'

export const crawlBrowserQueue = createQueue(CRAWL_BROWSER_QUEUE_NAME)
