import { createQueue } from '@data-stores/valkey-glide-mq'
import { ACCOUNT_DATA_REQUESTS_QUEUE_NAME } from './config.mts'

export const accountDataRequests = createQueue(ACCOUNT_DATA_REQUESTS_QUEUE_NAME)
