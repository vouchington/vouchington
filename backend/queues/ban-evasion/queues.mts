import { createQueue } from '@data-stores/valkey-glide-mq'
import { BAN_EVASION_QUEUE_NAME } from './config.mts'

export const ban_evasion = createQueue(BAN_EVASION_QUEUE_NAME)
