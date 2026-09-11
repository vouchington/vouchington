import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import type { APIGatewayProxyEvent } from 'aws-lambda'

import { parseSideloadRequest } from '../parse-sideload.mts'

import { RequestParseError } from '../../errors.mts'

import { toBase64Url } from '../../test-helpers/index.mts'

import { signPath, SIDELOAD_SIGNING_KEYS_ENV } from '@ts-shared/url-signing'

import { TEST_SIDELOAD_SIGNING_KEY } from '@ts-shared/url-signing/test-key'

function createMockEvent(
  base64url: string,
  queryParams: Record<string, string> = {},
  headers: Record<string, string> = {},
): APIGatewayProxyEvent {
  return {
    pathParameters: { base64url },
    queryStringParameters: queryParams,
    headers,
  } as unknown as APIGatewayProxyEvent
}

describe('parseSideloadRequest — signature verification', () => {
  const savedEnv = process.env[SIDELOAD_SIGNING_KEYS_ENV]
  const savedEnvironment = process.env.ENVIRONMENT
  const savedNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    process.env[SIDELOAD_SIGNING_KEYS_ENV] = TEST_SIDELOAD_SIGNING_KEY
    process.env.NODE_ENV = 'test'
    delete process.env.ENVIRONMENT
  })

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env[SIDELOAD_SIGNING_KEYS_ENV]
    } else {
      process.env[SIDELOAD_SIGNING_KEYS_ENV] = savedEnv
    }
    if (savedEnvironment === undefined) {
      delete process.env.ENVIRONMENT
    } else {
      process.env.ENVIRONMENT = savedEnvironment
    }
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = savedNodeEnv
    }
  })

  function makeSignedEvent(url: string, extraParams: Record<string, string> = {}) {
    const base64url = toBase64Url(url)
    const path = `/sideload/${base64url}`
    const sig = signPath(path, [TEST_SIDELOAD_SIGNING_KEY])
    return createMockEvent(base64url, { w: '800', sig, ...extraParams })
  }

  it('accepts a valid signature', () => {
    const url = 'https://example.com/image.jpg'
    const result = parseSideloadRequest(makeSignedEvent(url))
    expect(result.url).toBe(url)
  })

  it('rejects a missing signature with 403', () => {
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800' }) // no sig
    let errMissingSig: RequestParseError | undefined
    try {
      parseSideloadRequest(event)
    } catch (err) {
      errMissingSig = err as RequestParseError
    }
    expect(errMissingSig).toBeInstanceOf(RequestParseError)
    expect(errMissingSig?.statusCode).toBe(403)
  })

  it('rejects an invalid signature with 403', () => {
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800', sig: 'a'.repeat(64) })
    let errInvalidSig: RequestParseError | undefined
    try {
      parseSideloadRequest(event)
    } catch (err) {
      errInvalidSig = err as RequestParseError
    }
    expect(errInvalidSig).toBeInstanceOf(RequestParseError)
    expect(errInvalidSig?.statusCode).toBe(403)
  })

  it('rejects a tampered path with 403', () => {
    // Sign one URL but use it for a different URL
    const signedForUrl = 'https://example.com/image.jpg'
    const otherUrl = 'https://evil.com/malicious.jpg'
    const base64url = toBase64Url(signedForUrl)
    const path = `/sideload/${base64url}`
    const sig = signPath(path, [TEST_SIDELOAD_SIGNING_KEY])
    // Use the correct sig but a different base64url in the request
    const tamperedBase64url = toBase64Url(otherUrl)
    const event = createMockEvent(tamperedBase64url, { w: '800', sig })
    expect(() => parseSideloadRequest(event)).toThrow(RequestParseError)
  })

  it('accepts signature from an old key during rotation', () => {
    const oldKey = 'cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe'
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const path = `/sideload/${base64url}`
    // Signed with old key
    const sig = signPath(path, [oldKey])
    // Lambda configured with [newKey, oldKey]
    process.env[SIDELOAD_SIGNING_KEYS_ENV] = `${TEST_SIDELOAD_SIGNING_KEY},${oldKey}`
    const event = createMockEvent(base64url, { w: '800', sig })
    const result = parseSideloadRequest(event)
    expect(result.url).toBe(url)
  })

  it('rejects unsigned sideload requests in staging when signing keys are missing', () => {
    delete process.env[SIDELOAD_SIGNING_KEYS_ENV]
    process.env.ENVIRONMENT = 'staging'
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800' })
    let err: RequestParseError | undefined
    try {
      parseSideloadRequest(event)
    } catch (caught) {
      err = caught as RequestParseError
    }
    expect(err).toBeInstanceOf(RequestParseError)
    const error = err!
    expect(error.statusCode).toBe(403)
    expect(() => {
      throw new RequestParseError(error.message, error.statusCode)
    }).toThrow(/signing keys/)
  })

  it('keeps unsigned sideload requests available outside deployed environments', () => {
    delete process.env[SIDELOAD_SIGNING_KEYS_ENV]
    process.env.NODE_ENV = 'test'
    const url = 'https://example.com/image.jpg'
    const base64url = toBase64Url(url)
    const event = createMockEvent(base64url, { w: '800' })
    expect(parseSideloadRequest(event).url).toBe(url)
  })
})
