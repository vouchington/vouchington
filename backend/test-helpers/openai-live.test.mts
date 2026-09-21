import { APIError } from 'openai'
import { describe, expect, it, type TestContext, vi } from 'vitest'
import { liveOpenAITest, liveOpenRouterTest } from './openai-live.mts'

describe('liveOpenAITest', () => {
  it('passes a successful body straight through', async () => {
    const context = makeContext()

    await liveOpenAITest(async () => {})(context.value)

    expect(context.skip).not.toHaveBeenCalled()
  })

  it('skips with an attributable note when OpenAI was unavailable', async () => {
    const context = makeContext()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await liveOpenAITest(async () => {
      throw new APIError(
        429,
        { code: 'rate_limit_exceeded' },
        undefined,
        new Headers({ 'x-request-id': 'req_rate_limited' }),
      )
    })(context.value)

    const note =
      'OpenAI was unavailable — OpenAI returned 429 (status=429, request_id=req_rate_limited, code=rate_limit_exceeded)'
    expect(context.skip).toHaveBeenCalledExactlyOnceWith(note)
    expect(warn).toHaveBeenCalledExactlyOnceWith(note)
    warn.mockRestore()
  })

  it('omits details OpenAI did not supply', async () => {
    const context = makeContext()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await liveOpenAITest(async () => {
      throw new APIError(503, undefined, undefined, new Headers())
    })(context.value)

    expect(context.skip).toHaveBeenCalledExactlyOnceWith(
      'OpenAI was unavailable — OpenAI returned 503 (status=503)',
    )
    warn.mockRestore()
  })

  it('attributes an OpenRouter outage to OpenRouter', async () => {
    const context = makeContext()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await liveOpenRouterTest(async () => {
      throw new APIError(503, undefined, undefined, new Headers())
    })(context.value)

    expect(context.skip).toHaveBeenCalledExactlyOnceWith(
      'OpenRouter was unavailable — OpenRouter returned 503 (status=503)',
    )
    warn.mockRestore()
  })

  it('rethrows a failed assertion rather than hiding it behind a skip', async () => {
    const context = makeContext()
    const failure = new Error('expected 1 to be 2')

    await expect(
      liveOpenAITest(async () => {
        throw failure
      })(context.value),
    ).rejects.toBe(failure)
    expect(context.skip).not.toHaveBeenCalled()
  })
})

type SkipMock = ReturnType<typeof vi.fn<(note: string) => void>>

function makeContext(): { value: TestContext; skip: SkipMock } {
  const skip = vi.fn<(note: string) => void>()
  return { value: { skip } as unknown as TestContext, skip }
}
