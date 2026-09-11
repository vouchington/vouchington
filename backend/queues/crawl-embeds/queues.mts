import { createQueue } from '@data-stores/valkey-glide-mq'
import { CRAWL_EMBEDS_QUEUE_NAME } from './config.mts'

export const crawlEmbedsQueue = createQueue(CRAWL_EMBEDS_QUEUE_NAME)
