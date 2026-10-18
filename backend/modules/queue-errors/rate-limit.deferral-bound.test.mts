import { Worker } from 'glide-mq'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpRateLimitError } from '@modules/on-error/errors'
import {
  boundRateLimitDeferral,
  createRateLimitError,
  MAX_RATE_LIMIT_DEFERRAL_AGE_MS,
} from './index.mts'

const ENDPOINT = 'https://remote.example.test/inbox'
const UTC_BOUNDARIES = [
  '2024-02-29T23:59:59.999Z',
  '2024-03-01T00:00:00.001Z',
  '2024-12-31T23:59:59.999Z',
  '2025-01-01T00:00:00.001Z',
] as const

function jobCreatedAgo(ageMs: number) {
  return { timestamp: Date.now() - ageMs }
}

function failsWith(failure: Error) {
  return async (): Promise<never> => {
    throw failure
  }
}

describe('boundRateLimitDeferral', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(UTC_BOUNDARIES[0]))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns what the processor returns', async () => {
    await expect(boundRateLimitDeferral(jobCreatedAgo(0), async () => 'done')).resolves.toBe('done')
  })

  it.each(UTC_BOUNDARIES)(
    'keeps the no-attempt requeue one millisecond inside the window at %s',
    async now => {
      const signal = createRateLimitError(120_000, new HttpRateLimitError(ENDPOINT, 429, 120_000))
      vi.setSystemTime(new Date(now))
      const job = jobCreatedAgo(MAX_RATE_LIMIT_DEFERRAL_AGE_MS - 1)
      await expect(boundRateLimitDeferral(job, failsWith(signal))).rejects.toBe(signal)
    },
  )

  it('keeps the requeue for a job whose creation time is unknown', async () => {
    const signal = createRateLimitError(120_000)

    await expect(boundRateLimitDeferral({ timestamp: 0 }, failsWith(signal))).rejects.toBe(signal)
  })

  it.each(
    UTC_BOUNDARIES.flatMap(now => [
      { now, ageMs: MAX_RATE_LIMIT_DEFERRAL_AGE_MS, boundary: 'at cap' },
      { now, ageMs: MAX_RATE_LIMIT_DEFERRAL_AGE_MS + 1, boundary: 'one millisecond past cap' },
    ]),
  )('hands the plain failure to a job $boundary at $now', async ({ now, ageMs }) => {
    const cause = new HttpRateLimitError(ENDPOINT, 429, 120_000)
    const signal = createRateLimitError(120_000, cause)
    vi.setSystemTime(new Date(now))
    const job = jobCreatedAgo(ageMs)
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
