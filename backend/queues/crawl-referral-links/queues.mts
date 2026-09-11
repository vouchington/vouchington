import { createQueue } from '@data-stores/valkey-glide-mq'
import { CRAWL_REFERRAL_LINKS_QUEUE_NAME } from './config.mts'

export const crawlReferralLinksQueue = createQueue(CRAWL_REFERRAL_LINKS_QUEUE_NAME)
