import type { Job } from 'glide-mq'
import { boundRateLimitDeferral, throwRateLimited } from './rate-limit.mts'

// pg-pool emits these when a new connection cannot be established or a queued
// checkout cannot acquire a client before connectionTimeoutMillis expires.
const POSTGRES_CONNECTION_TIMEOUT_MESSAGES = new Set([
  'Connection terminated due to connection timeout',
  'timeout exceeded when trying to connect',
])
const POSTGRES_CONNECTION_RETRY_DELAY_MS = 30_000

/** Defers a worker job while its PostgreSQL pool cannot supply a connection. */
export async function deferPostgresConnectionTimeout<T>(
  job: Pick<Job, 'timestamp'>,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (!(err instanceof Error) || !POSTGRES_CONNECTION_TIMEOUT_MESSAGES.has(err.message)) {
      throw err
    }

    // A no-attempt requeue cannot continue forever during a persistent outage.
    // Once the existing deferral age is exhausted, retry under the job's attempts.
    return boundRateLimitDeferral(job, async () =>
      throwRateLimited(POSTGRES_CONNECTION_RETRY_DELAY_MS, err),
    )
  }
}
