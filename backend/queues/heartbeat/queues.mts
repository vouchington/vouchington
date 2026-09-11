import { createQueue } from '@data-stores/valkey-glide-mq'
import { QUEUE_NAME } from './config.mts'
import type { HeartbeatData } from './types.mts'

export const heartbeat = createQueue<HeartbeatData>(QUEUE_NAME)
