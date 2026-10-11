import { Worker } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { HttpRateLimitError } from '@modules/on-error/errors'
import {
  boundRateLimitDeferral,
  createRateLimitError,
  MAX_RATE_LIMIT_DEFERRAL_AGE_MS,
} from './index.mts'

const ENDPOINT = 'https://remote.example.test/inbox'

function jobCreatedAgo(ageMs: number) {
  return { timestamp: Date.now() - ageMs }
}

function failsWith(failure: Error) {
  return async (): Promise<never> => {
    throw failure
  }
}

describe('boundRateLimitDeferral', () => {
  it('returns what the processor returns', async () => {
    await expect(boundRateLimitDeferral(jobCreatedAgo(0), async () => 'done')).resolves.toBe('done')
  })

  it('keeps the no-attempt requeue while the job is inside the window', async () => {
    const signal = createRateLimitError(120_000, new HttpRateLimitError(ENDPOINT, 429, 120_000))
    const job = jobCreatedAgo(MAX_RATE_LIMIT_DEFERRAL_AGE_MS - 60_000)

    await expect(boundRateLimitDeferral(job, failsWith(signal))).rejects.toBe(signal)
  })

  it('keeps the requeue for a job whose creation time is unknown', async () => {
    const signal = createRateLimitError(120_000)

    await expect(boundRateLimitDeferral({ timestamp: 0 }, failsWith(signal))).rejects.toBe(signal)
  })

  it('hands an expired job the plain failure so it spends attempts and ends', async () => {
    const cause = new HttpRateLimitError(ENDPOINT, 429, 120_000)
    const signal = createRateLimitError(120_000, cause)
    const job = jobCreatedAgo(MAX_RATE_LIMIT_DEFERRAL_AGE_MS + 60_000)

    const thrown: unknown = await boundRateLimitDeferral(job, failsWith(signal)).catch(
      (err: unknown) => err,
    )

    expect(thrown).toBe(cause)
    expect(thrown).not.toBeInstanceOf(Worker.RateLimitError)
  })

  it('wraps an expired signal that carries no failure', async () => {
    const signal = createRateLimitError(120_000)
    const job = jobCreatedAgo(MAX_RATE_LIMIT_DEFERRAL_AGE_MS + 60_000)

    const thrown: unknown = await boundRateLimitDeferral(job, failsWith(signal)).catch(
      (err: unknown) => err,
    )

    expect(thrown).toBeInstanceOf(Error)
    expect(thrown).not.toBeInstanceOf(Worker.RateLimitError)
    expect(thrown).toHaveProperty('cause', signal)
  })

  it('passes any other failure through at any age', async () => {
    const failure = new Error('socket hang up')
    const job = jobCreatedAgo(MAX_RATE_LIMIT_DEFERRAL_AGE_MS * 2)

    await expect(boundRateLimitDeferral(job, failsWith(failure))).rejects.toBe(failure)
  })
})
