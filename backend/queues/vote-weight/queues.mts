import { createQueue } from '@data-stores/valkey-glide-mq'
import type { VoteWeightJobData } from './types.mts'
import { QUEUE_NAME } from './config.mts'

export const voteWeightQueue = createQueue<VoteWeightJobData['data']>(QUEUE_NAME)
