import { createQueue } from '@data-stores/valkey-glide-mq'
import type { VoteIntegrityJobData } from './types.mts'
import { QUEUE_NAME } from './config.mts'

export const voteIntegrityQueue = createQueue<VoteIntegrityJobData['data']>(QUEUE_NAME)
