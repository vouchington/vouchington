import { describe, expect, it } from 'vitest'
import {
  isOpenAIFlexCapacityFailedResponseError,
  OpenAIResponseNotCompletedError,
  OpenAIResponseStreamError,
  shouldLatchUnknownBilledOpenAIAttempt,
} from './response-errors.mts'
import { makeSdkResponse } from '../../test-helpers/modules/openai-utils/responses.mts'

const FLEX_MESSAGE = 'Flex processing is temporarily unavailable. Please try again later.'

function failedResponseError(
  overrides: Partial<Parameters<typeof makeSdkResponse>[0]> = {},
): OpenAIResponseNotCompletedError {
  const response = makeSdkResponse({
    status: 'failed',
    usage: undefined,
    error: { code: 'server_error', message: FLEX_MESSAGE },
    ...overrides,
  })
  return new OpenAIResponseNotCompletedError(
    `OpenAI response failed (${response.error?.code}): ${response.error?.message}`,
    response,
  )
}

describe('isOpenAIFlexCapacityFailedResponseError', () => {
  it('recognizes a usage-free server_error failure naming flex capacity', () => {
    expect(isOpenAIFlexCapacityFailedResponseError(failedResponseError())).toBe(true)
  })

  it('treats the explicit usage: null that OpenResponses providers send as no usage', () => {
    const nullUsage = failedResponseError({ usage: null as unknown as undefined })

    expect(isOpenAIFlexCapacityFailedResponseError(nullUsage)).toBe(true)
  })

  it.each([
    ['another server_error message', { error: { code: 'server_error' as const, message: 'oops' } }],
    [
      'a different failure code',
      { error: { code: 'invalid_prompt' as const, message: FLEX_MESSAGE } },
    ],
    ['an incomplete status', { status: 'incomplete' as const }],
    [
      'a failure that carries usage',
      {
        usage: {
          input_tokens: 3,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          output_tokens: 1,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 4,
        },
      },
    ],
  ])('rejects %s', (_label, overrides) => {
    expect(isOpenAIFlexCapacityFailedResponseError(failedResponseError(overrides))).toBe(false)
  })

  it('rejects errors that are not terminal-response errors', () => {
    expect(isOpenAIFlexCapacityFailedResponseError(new Error(FLEX_MESSAGE))).toBe(false)
    expect(
      isOpenAIFlexCapacityFailedResponseError(
        new OpenAIResponseStreamError({ code: 'server_error', message: FLEX_MESSAGE, param: null }),
      ),
    ).toBe(false)
    expect(isOpenAIFlexCapacityFailedResponseError(undefined)).toBe(false)
  })
})

describe('shouldLatchUnknownBilledOpenAIAttempt for flex capacity failures', () => {
  it('treats a flex capacity failure as unbilled so it cannot fail-close the spend cap', () => {
    expect(shouldLatchUnknownBilledOpenAIAttempt(failedResponseError())).toBe(false)
  })

  it('still latches a usage-free failure that is not a flex capacity failure', () => {
    expect(
      shouldLatchUnknownBilledOpenAIAttempt(
        failedResponseError({ error: { code: 'server_error', message: 'oops' } }),
      ),
    ).toBe(true)
  })
})
