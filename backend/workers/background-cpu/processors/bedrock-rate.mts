import { isBedrockRateLimitError, throwRateLimited, wrapHttpForRetry } from '@modules/queue-errors'

/** Convert Bedrock throttling to a job-scoped deferral; never idle the whole CPU worker. */
export async function withBedrockRateLimit<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (isBedrockRateLimitError(err)) throwRateLimited(60_000, err)
    return wrapHttpForRetry(err)
  }
}
