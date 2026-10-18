import { describe, expect, it, vi } from 'vitest'
import { Worker } from 'glide-mq'
import { UnrecoverableError } from '@modules/queue-errors'
import { withBedrockRateLimit } from './bedrock-rate.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('Bedrock errors on the shared CPU worker', () => {
  it('returns successful provider work', async () => {
    await expect(withBedrockRateLimit(async () => 'completed')).resolves.toBe('completed')
  })

  it('turns Bedrock throttling into a job-scoped deferral signal', async () => {
    const throttle = Object.assign(new Error('Bedrock request throttled'), {
      name: 'ThrottlingException',
      $metadata: { httpStatusCode: 429 },
    })
    const outcome: unknown = await withBedrockRateLimit(async () => {
      throw throttle
    }).catch((err: unknown) => err)
    expect(outcome).toBeInstanceOf(Worker.RateLimitError)
    expect(outcome).toMatchObject({
      delayMs: 60_000,
      cause: throttle,
    })
  })

  it('fails a permanent provider request without retrying', async () => {
    const invalid = Object.assign(new Error('Invalid model request'), {
      $metadata: { httpStatusCode: 400 },
    })
    await expect(
      withBedrockRateLimit(async () => {
        throw invalid
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError)
  })

  it('keeps a transient provider failure retryable', async () => {
    const unavailable = Object.assign(new Error('Bedrock unavailable'), {
      $metadata: { httpStatusCode: 503 },
    })
    await expect(
      withBedrockRateLimit(async () => {
        throw unavailable
      }),
    ).rejects.toBe(unavailable)
  })
})
