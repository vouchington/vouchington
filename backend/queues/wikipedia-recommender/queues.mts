import { createQueue } from '@data-stores/valkey-glide-mq'
import { QUEUE_NAME } from './config.mts'
import type { DispatchJobData } from './types.mts'

export const wikipediaRecommender = createQueue<DispatchJobData>(QUEUE_NAME)
