import { APIError, APIUserAbortError } from 'openai'
import { describe, expect, it } from 'vitest'
import { streamOpenAIResponseEvents } from './create-response.mts'
import {
  isOpenAIMissingPreviousResponseError,
  OpenAIResponseNotCompletedError,
  OpenAIResponseStreamError,
  shouldLatchUnknownBilledOpenAIAttempt,
} from './response-errors.mts'
import { makeErrorEvent, makeResponseStream, makeSdkResponse } from './test-helpers/responses.mts'

describe('OpenAI response errors', () => {
  it('preserves structured OpenAI stream error metadata', async () => {
    const gen = streamOpenAIResponseEvents(
      makeResponseStream([
        makeErrorEvent({
          code: 'previous_response_not_found',
          message: 'The previous response expired',
          param: 'previous_response_id',
        }),
      ]),
    )

    const next = gen.next()

    await expect(next).rejects.toBeInstanceOf(OpenAIResponseStreamError)
    await expect(next).rejects.toMatchObject({
      name: 'Error',
      message: 'OpenAI response error (previous_response_not_found): The previous response expired',
      code: 'previous_response_not_found',
      param: 'previous_response_id',
    })
  })

  it('classifies direct and cause-wrapped missing previous response API errors', () => {
    const apiError = makeMissingPreviousResponseAPIError()

    expect(isOpenAIMissingPreviousResponseError(apiError)).toBe(true)
    expect(
      isOpenAIMissingPreviousResponseError(
        new Error('stream creation failed', { cause: apiError }),
      ),
    ).toBe(true)
  })

  it('classifies typed missing previous response stream errors', () => {
    const error = new OpenAIResponseStreamError({
      code: 'previous_response_not_found',
      message: 'expired',
      param: 'previous_response_id',
    })

    expect(isOpenAIMissingPreviousResponseError(error)).toBe(true)
  })

  it('rejects mismatched and message-only missing previous response errors', () => {
    const mismatches = [
      new APIError(
        404,
        { code: 'previous_response_not_found', param: 'previous_response_id' },
        undefined,
        new Headers(),
      ),
      new APIError(
        400,
        { code: 'invalid_request_error', param: 'previous_response_id' },
        undefined,
        new Headers(),
      ),
      new APIError(
        400,
        { code: 'previous_response_not_found', param: 'input' },
        undefined,
        new Headers(),
      ),
      new OpenAIResponseStreamError({
        code: 'invalid_request_error',
        message: 'previous_response_not_found for previous_response_id',
        param: 'previous_response_id',
      }),
      new Error('400 previous_response_not_found previous_response_id'),
    ]

    for (const error of mismatches) {
      expect(isOpenAIMissingPreviousResponseError(error)).toBe(false)
    }
  })

  it('latches terminal responses only when usage is missing', () => {
    const withUsage = new OpenAIResponseNotCompletedError(
      'failed',
      makeSdkResponse({ status: 'failed' }),
    )
    const withoutUsage = new OpenAIResponseNotCompletedError(
      'failed',
      makeSdkResponse({ status: 'failed', usage: undefined }),
    )

    expect(withUsage.usage).toEqual(expect.objectContaining({ input_tokens: 1, output_tokens: 1 }))
    expect(withoutUsage.usage).toBeUndefined()
    expect(shouldLatchUnknownBilledOpenAIAttempt(withUsage)).toBe(false)
    expect(shouldLatchUnknownBilledOpenAIAttempt(withoutUsage)).toBe(true)
    expect(shouldLatchUnknownBilledOpenAIAttempt(new Error('socket closed'))).toBe(true)
  })

  it('does not latch explicit client cancellation', () => {
    const abort = new Error('This operation was aborted')
    abort.name = 'AbortError'
    const wrapped = new Error('stream iteration failed', { cause: abort })

    expect(shouldLatchUnknownBilledOpenAIAttempt(abort)).toBe(false)
    expect(shouldLatchUnknownBilledOpenAIAttempt(new APIUserAbortError())).toBe(false)
    expect(shouldLatchUnknownBilledOpenAIAttempt(wrapped)).toBe(false)
    const timeout = new Error('timed out')
    timeout.name = 'TimeoutError'
    expect(shouldLatchUnknownBilledOpenAIAttempt(timeout)).toBe(true)
  })

  it('does not latch recoverable missing previous-response errors', () => {
    const streamError = new OpenAIResponseStreamError({
      code: 'previous_response_not_found',
      message: 'expired',
      param: 'previous_response_id',
    })

    expect(shouldLatchUnknownBilledOpenAIAttempt(streamError)).toBe(false)
    expect(shouldLatchUnknownBilledOpenAIAttempt(makeMissingPreviousResponseAPIError())).toBe(false)
  })

  it('handles cyclic error cause chains without looping', () => {
    const first = new Error('first')
    const second = new Error('second', { cause: first })
    Object.defineProperty(first, 'cause', { value: second })

    expect(isOpenAIMissingPreviousResponseError(first)).toBe(false)
  })
})

function makeMissingPreviousResponseAPIError(): APIError {
  return new APIError(
    400,
    {
      code: 'previous_response_not_found',
      message: 'The previous response expired',
      param: 'previous_response_id',
    },
    undefined,
    new Headers(),
  )
}
