import { APIError } from 'openai'
import type { ResponseCreateParamsStreaming } from 'openai/resources/responses/responses'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOpenAICompatibleResponseWithRetries } from './response-retry.mts'

const MAX_RETRY_DELAY_MS = 8_000
const DEFAULT_NOW = '2026-10-05T23:59:40.000Z'
const request = {
  model: 'gpt-test',
  input: 'ping',
  stream: true,
} as ResponseCreateParamsStreaming

const recordedDelays = vi.hoisted(() => ({ values: new Array<number>() }))

vi.mock<typeof import('node:timers/promises')>(
  import('node:timers/promises'),
  async importOriginal => {
    const actual = await importOriginal()
    return {
      ...actual,
      setTimeout: (async (delay?: number) => {
        recordedDelays.values.push(Number(delay))
      }) as typeof actual.setTimeout,
    }
  },
)

describe('createOpenAICompatibleResponseWithRetries', () => {
  beforeEach(() => {
    recordedDelays.values.length = 0
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(process.env.VOUCH_PROOF_NOW ?? DEFAULT_NOW))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clamps provider retry-after-ms and Retry-After to the 8s bound', async () => {
    const retryAfterMs = unavailable({ 'retry-after-ms': '60000' })
    const retryAfterSeconds = unavailable({ 'retry-after': '120' })
    const farFuture = new Date(Date.now() + 3_600_000).toUTCString()
    const retryAfterDate = unavailable({ 'retry-after': farFuture })

    await expect(retryOnce(retryAfterMs)).rejects.toBe(retryAfterMs)
    await expect(retryOnce(retryAfterSeconds)).rejects.toBe(retryAfterSeconds)
    await expect(retryOnce(retryAfterDate)).rejects.toBe(retryAfterDate)

    expect(recordedDelays.values).toEqual([
      MAX_RETRY_DELAY_MS,
      MAX_RETRY_DELAY_MS,
      MAX_RETRY_DELAY_MS,
    ])
  })

  it('preserves a provider delay that is already under the bound', async () => {
    const error = unavailable({ 'retry-after-ms': '1500' })

    await expect(retryOnce(error)).rejects.toBe(error)

    expect(recordedDelays.values).toEqual([1500])
  })
})

function unavailable(headers: Record<string, string>): APIError {
  return new APIError(
    429,
    { code: 'resource_unavailable' },
    'resource unavailable',
    new Headers(headers),
  )
}

function retryOnce(error: APIError): Promise<unknown> {
  return createOpenAICompatibleResponseWithRetries(
    async () => {
      throw error
    },
    request,
    { maxRetries: 1 },
  )
}
