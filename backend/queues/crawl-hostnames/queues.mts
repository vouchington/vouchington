import { createQueue } from '@data-stores/valkey-glide-mq'
import { CRAWL_HOSTNAMES_QUEUE_NAME } from './config.mts'

export const crawlHostnamesQueue = createQueue(CRAWL_HOSTNAMES_QUEUE_NAME)
