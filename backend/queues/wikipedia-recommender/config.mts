export const QUEUE_NAME = 'wikipedia-recommender'
export const PRIORITY_DISPATCHER = 100

// Run hourly at the top of every hour
export const CRON_PATTERN = '0 * * * *'

// Process up to 50 posts from the last 24 hours per run
// Note: This may process the same posts multiple times if they were created in the last 24 hours
export const BATCH_SIZE = 50

export const WIKIPEDIA_RECOMMENDER_ORDERING = {
  dispatcher: { key: 'dispatcher', concurrency: 1 },
} as const

export const WIKIPEDIA_RECOMMENDER_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
}
