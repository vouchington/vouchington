import { createQueue } from '@data-stores/valkey-glide-mq'
import { UNFURL_REFERRAL_LINKS_QUEUE_NAME } from './config.mts'

export const unfurlReferralLinksQueue = createQueue(UNFURL_REFERRAL_LINKS_QUEUE_NAME)
