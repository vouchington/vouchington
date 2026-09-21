import { createQueue } from '@data-stores/valkey-glide-mq'

export const wikipediaRecommenderSchedulerTombstone =
  createQueue<Record<string, never>>('wikipedia-recommender')
