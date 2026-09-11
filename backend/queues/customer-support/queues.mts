import { createQueue } from '@data-stores/valkey-glide-mq'
import { CUSTOMER_SUPPORT_QUEUE_NAME } from './config.mts'

export const customer_support = createQueue(CUSTOMER_SUPPORT_QUEUE_NAME)
