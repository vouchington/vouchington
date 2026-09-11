import { describe, expect, it } from 'vitest'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'
import { ApiError } from './error'
import {
  getApiErrorMessage,
  hasErrorCode,
  parseErrorDigest,
  parseErrorResponseBody,
} from './error-helpers'

function translateDigest(result: ReturnType<typeof parseErrorDigest>) {
  if (!result) return result
  return {
    status: result.status,
    title: defaultTranslator(result.title),
    description: defaultTranslator(result.description),
  }
}

describe('getApiErrorMessage', () => {
  it('returns ApiError message', () => {
    expect(getApiErrorMessage(new ApiError('boom', 500), 'fallback')).toBe('boom')
  })

  it('returns ApiError backend error payloads before generic messages', () => {
    expect(
      getApiErrorMessage(new ApiError('generic', 400, { error: 'specific' }), 'fallback'),
    ).toBe('specific')
    expect(getApiErrorMessage(new ApiError('generic', 400, 'plain text'), 'fallback')).toBe(
      'plain text',
    )
  })

  it('returns fallback for non-ApiError values', () => {
    expect(getApiErrorMessage(new Error('other'), 'fallback')).toBe('fallback')
    expect(getApiErrorMessage('string', 'fallback')).toBe('fallback')
    expect(getApiErrorMessage(null, 'fallback')).toBe('fallback')
  })
})

describe('hasErrorCode', () => {
  it('matches when ApiError code equals provided code', () => {
    const error = new ApiError('Unauthorized', 401, { code: 'SESSION_EXPIRED' })
    expect(hasErrorCode(error, 'SESSION_EXPIRED')).toBe(true)
    expect(hasErrorCode(error, 'OTHER_CODE')).toBe(false)
  })

  it('returns false for non-ApiError values', () => {
    expect(hasErrorCode(new Error('boom'), 'CODE')).toBe(false)
    expect(hasErrorCode(null, 'CODE')).toBe(false)
  })
})

describe('parseErrorResponseBody', () => {
  it('returns parsed JSON when the body is JSON', async () => {
    const response = new Response(JSON.stringify({ message: 'bad', code: 'X' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await parseErrorResponseBody(response)
    expect(result).toEqual({ message: 'bad', code: 'X' })
  })

  it('returns the raw text when the body is not JSON', async () => {
    const response = new Response('plain text error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    })

    const result = await parseErrorResponseBody(response)
    expect(result).toBe('plain text error')
  })

  it('returns the empty string when the body is empty', async () => {
    const response = new Response('', { status: 500 })

    const result = await parseErrorResponseBody(response)
    expect(result).toBe('')
  })

  it('returns null when the body cannot be read', async () => {
    const fakeResponse = new Response(
      new ReadableStream({
        pull() {
          throw new Error('stream broken')
        },
      }),
      { status: 500 },
    )

    const result = await parseErrorResponseBody(fakeResponse)
    expect(result).toBeNull()
  })

  it('cancels and discards an oversized error response', async () => {
    let cancelled = false
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(64 * 1024 + 1))
        },
        cancel() {
          cancelled = true
        },
      }),
      { status: 500 },
    )

    await expect(parseErrorResponseBody(response)).resolves.toBeNull()
    expect(cancelled).toBe(true)
  })

  it('cancels before reading when content-length exceeds the limit', async () => {
    let cancelled = false
    const response = new Response(
      new ReadableStream({
        cancel() {
          cancelled = true
        },
      }),
      { status: 500, headers: { 'content-length': String(64 * 1024 + 1) } },
    )

    await expect(parseErrorResponseBody(response)).resolves.toBeNull()
    expect(cancelled).toBe(true)
  })
})

describe('parseErrorDigest', () => {
  it('returns status, title, and description for EXPECTED_CLIENT_ERROR;429', () => {
    const result = parseErrorDigest('EXPECTED_CLIENT_ERROR;429')
    expect(translateDigest(result)).toEqual({
      status: 429,
      title: 'Too many requests',
      description: "You're sending requests too quickly. Please wait a moment and try again.",
    })
  })

  it('returns status, title, and description for EXPECTED_CLIENT_ERROR;400', () => {
    const result = parseErrorDigest('EXPECTED_CLIENT_ERROR;400')
    expect(translateDigest(result)).toEqual({
      status: 400,
      title: 'Bad request',
      description: 'The request was invalid. Please try again.',
    })
  })

  it('returns generic copy for unrecognized 4xx status codes', () => {
    const result = parseErrorDigest('EXPECTED_CLIENT_ERROR;418')
    expect(translateDigest(result)).toEqual({
      status: 418,
      title: 'Something went wrong',
      description: 'An error occurred. Please try again.',
    })
  })

  it('returns null for undefined digest', () => {
    expect(parseErrorDigest(undefined)).toBeNull()
  })

  it('returns null for NEXT_HTTP_ERROR_FALLBACK digests', () => {
    expect(parseErrorDigest('NEXT_HTTP_ERROR_FALLBACK;404')).toBeNull()
    expect(parseErrorDigest('NEXT_HTTP_ERROR_FALLBACK;401')).toBeNull()
  })

  it('returns null for the legacy bare EXPECTED_CLIENT_ERROR format', () => {
    expect(parseErrorDigest('EXPECTED_CLIENT_ERROR')).toBeNull()
  })

  it('returns null for arbitrary strings', () => {
    expect(parseErrorDigest('some random string')).toBeNull()
    expect(parseErrorDigest('')).toBeNull()
  })
})
