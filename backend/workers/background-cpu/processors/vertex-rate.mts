import { wrapHttpForRetry } from '@modules/queue-errors'
import { throwRateLimited } from '@vouchington/queue-errors'
import { Worker } from 'glide-mq'

/** Convert a Vertex 429 into a job-scoped deferral without idling the shared CPU worker. */
export async function withVertexRateLimit<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (getHttpStatus(err) === 429)
      throwRateLimited(60_000, err, { RateLimitError: Worker.RateLimitError })
    return wrapHttpForRetry(err)
  }
}

function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const candidate = error as { status?: unknown; statusCode?: unknown }
  if (typeof candidate.status === 'number') return candidate.status
  return typeof candidate.statusCode === 'number' ? candidate.statusCode : undefined
}
