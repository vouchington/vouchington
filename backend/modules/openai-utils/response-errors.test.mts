import { APIConnectionError, APIError, APIUserAbortError } from 'openai'
import { describe, expect, it } from 'vitest'
import { streamOpenAIResponseEvents } from './create-response.mts'
import {
  describeOpenAIUpstreamFailure,
  isOpenAIMissingPreviousResponseError,
  OpenAIResponseNotCompletedError,
  OpenAIResponseStreamError,
  OpenAIResponseStreamIterationError,
  shouldLatchUnknownBilledOpenAIAttempt,
} from './response-errors.mts'
import {
  makeErrorEvent,
  makeResponseStream,
  makeSdkResponse,
} from '../../test-helpers/modules/openai-utils/responses.mts'

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

describe('describeOpenAIUpstreamFailure', () => {
  it('tolerates a bodiless 404 and keeps its request id attributable', () => {
    const error = new APIError(404, undefined, undefined, makeHeaders('req_bodiless'))

    expect(describeOpenAIUpstreamFailure(error)).toEqual({
      reason: 'OpenAI returned a 404 with no error body',
      status: 404,
      requestId: 'req_bodiless',
    })
  })

  it('does not tolerate a 404 that carries an error body', () => {
    // A retired or misspelled model is our bug to fix, and always arrives with a JSON body.
    const retiredModel = new APIError(
      404,
      {
        code: 'model_not_found',
        message: 'The model does not exist',
        type: 'invalid_request_error',
      },
      undefined,
      makeHeaders('req_model'),
    )
    const bodyWithoutCode = new APIError(404, { message: 'Not Found' }, undefined, makeHeaders())

    expect(describeOpenAIUpstreamFailure(retiredModel)).toBeNull()
    expect(describeOpenAIUpstreamFailure(bodyWithoutCode)).toBeNull()
  })

  it('tolerates transient statuses and connection failures', () => {
    for (const status of [408, 409, 429, 500, 502, 503]) {
      expect(
        describeOpenAIUpstreamFailure(new APIError(status, undefined, undefined, makeHeaders())),
      ).toEqual(expect.objectContaining({ status }))
    }

    expect(
      describeOpenAIUpstreamFailure(new APIConnectionError({ message: 'socket hang up' })),
    ).toEqual({
      reason: 'the connection to OpenAI failed',
    })
  })

  it('does not tolerate statuses that mean our request was wrong', () => {
    for (const status of [400, 401, 403, 422]) {
      expect(
        describeOpenAIUpstreamFailure(
          new APIError(status, { code: 'bad' }, undefined, makeHeaders()),
        ),
      ).toBeNull()
    }
  })

  it('tolerates a stream that produced nothing, but not one cut short after text', () => {
    const cause = new Error('terminated')

    expect(
      describeOpenAIUpstreamFailure(new OpenAIResponseStreamIterationError(false, { cause })),
    ).toEqual({ reason: 'the response stream ended before emitting any text' })
    expect(
      describeOpenAIUpstreamFailure(new OpenAIResponseStreamIterationError(true, { cause })),
    ).toBeNull()
  })

  it('tolerates a server_error response but not other terminal statuses', () => {
    const serverError = new OpenAIResponseNotCompletedError(
      'failed',
      makeSdkResponse({ status: 'failed', error: { code: 'server_error', message: 'oops' } }),
    )
    const invalidPrompt = new OpenAIResponseNotCompletedError(
      'failed',
      makeSdkResponse({ status: 'failed', error: { code: 'invalid_prompt', message: 'nope' } }),
    )

    expect(describeOpenAIUpstreamFailure(serverError)).toEqual({
      reason: 'OpenAI returned a failed response',
      code: 'server_error',
    })
    expect(describeOpenAIUpstreamFailure(invalidPrompt)).toBeNull()
  })

  it('does not tolerate our own cancellation, timeout budget, or a failed assertion', () => {
    const timeout = new Error('timed out')
    timeout.name = 'TimeoutError'
    const abortedUpstream = new Error('wrapped', {
      cause: new APIError(503, undefined, undefined, makeHeaders()),
    })
    abortedUpstream.name = 'AbortError'

    expect(describeOpenAIUpstreamFailure(new APIUserAbortError())).toBeNull()
    expect(describeOpenAIUpstreamFailure(timeout)).toBeNull()
    expect(describeOpenAIUpstreamFailure(new Error('expected true to be false'))).toBeNull()
    // A cancel anywhere in the chain wins over an upstream status deeper down.
    expect(describeOpenAIUpstreamFailure(abortedUpstream)).toBeNull()
  })

  it('finds an upstream failure wrapped behind a cause chain', () => {
    const wrapped = new Error('createOpenAIResponse failed', {
      cause: new OpenAIResponseStreamIterationError(false, {
        cause: new APIError(503, undefined, undefined, makeHeaders('req_deep')),
      }),
    })

    expect(describeOpenAIUpstreamFailure(wrapped)).toEqual({
      reason: 'the response stream ended before emitting any text',
    })
  })
})

function makeHeaders(requestId?: string): Headers {
  return new Headers(requestId === undefined ? {} : { 'x-request-id': requestId })
}

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
