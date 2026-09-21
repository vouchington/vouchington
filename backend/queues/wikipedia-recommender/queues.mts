import { createQueue } from '@data-stores/valkey-glide-mq'
import { QUEUE_NAME } from './config.mts'

export const wikipediaRecommenderSchedulerTombstone = createQueue<Record<string, never>>(QUEUE_NAME)
