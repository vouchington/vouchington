import { describe, expect, it } from 'vitest'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'
import { ApiError } from '@vouchington/api-client'
import { isTagLimitError, parseErrorDigest } from './error-helpers'

function translateDigest(result: ReturnType<typeof parseErrorDigest>) {
  if (!result) return result
  return {
    status: result.status,
    title: defaultTranslator(result.title),
    description: defaultTranslator(result.description),
  }
}

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

  it('returns null for digests that are not expected client errors', () => {
    expect(parseErrorDigest(undefined)).toBeNull()
    expect(parseErrorDigest('NEXT_HTTP_ERROR_FALLBACK;404')).toBeNull()
  })
})

describe('isTagLimitError', () => {
  it('matches only the tag limit API error code', () => {
    expect(isTagLimitError(new ApiError('cap', 409, { code: 'TAG_LIMIT_REACHED' }))).toBe(true)
    expect(isTagLimitError(new ApiError('other', 409, { code: 'OTHER' }))).toBe(false)
    expect(isTagLimitError(new Error('TAG_LIMIT_REACHED'))).toBe(false)
  })
})
