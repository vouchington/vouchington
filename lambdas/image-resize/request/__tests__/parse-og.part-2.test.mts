import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { parseOgRequest } from '../parse-og.mts'
import { RequestParseError } from '../../errors.mts'
import { toBase64Url } from '../../../test-helpers/image-resize/index.mts'
import { signPath, SIDELOAD_SIGNING_KEYS_ENV } from '@ts-shared/url-signing'
import { TEST_SIDELOAD_SIGNING_KEY } from '@ts-shared/url-signing/test-key'

const GENERIC_PARAMS = {
  type: 'generic',
  eyebrow: 'Voucha',
  title: 'A title',
  description: 'A description',
  domainLabel: 'voucha.ai',
}

function toOgBase64url(payload: unknown): string {
  return toBase64Url(JSON.stringify(payload))
}

function createMockEvent(
  ogBase64url: string,
  queryParams: Record<string, string> = {},
): APIGatewayProxyEvent {
  return {
    pathParameters: { ogBase64url },
    queryStringParameters: queryParams,
  } as unknown as APIGatewayProxyEvent
}

describe('parseOgRequest — signature verification', () => {
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

  function makeSignedEvent(payload: unknown = GENERIC_PARAMS) {
    const base64url = toOgBase64url(payload)
    const path = `/og/${base64url}`
    const sig = signPath(path, [TEST_SIDELOAD_SIGNING_KEY])
    return createMockEvent(base64url, { sig })
  }

  it('accepts a valid signature', () => {
    const result = parseOgRequest(makeSignedEvent())
    expect(result.params).toEqual(GENERIC_PARAMS)
  })

  it('rejects a missing signature with 403', () => {
    const base64url = toOgBase64url(GENERIC_PARAMS)
    const event = createMockEvent(base64url) // no sig
    let err: RequestParseError | undefined
    try {
      parseOgRequest(event)
    } catch (caught) {
      err = caught as RequestParseError
    }
    expect(err).toBeInstanceOf(RequestParseError)
    expect(err?.statusCode).toBe(403)
  })

  it('rejects an invalid signature with 403', () => {
    const base64url = toOgBase64url(GENERIC_PARAMS)
    const event = createMockEvent(base64url, { sig: 'a'.repeat(64) })
    let err: RequestParseError | undefined
    try {
      parseOgRequest(event)
    } catch (caught) {
      err = caught as RequestParseError
    }
    expect(err).toBeInstanceOf(RequestParseError)
    expect(err?.statusCode).toBe(403)
  })

  it('rejects a tampered path with 403', () => {
    // Sign params for one payload but present a different one under the same sig.
    const signedForBase64url = toOgBase64url(GENERIC_PARAMS)
    const path = `/og/${signedForBase64url}`
    const sig = signPath(path, [TEST_SIDELOAD_SIGNING_KEY])
    const tamperedBase64url = toOgBase64url({ ...GENERIC_PARAMS, title: 'evil replacement' })
    const event = createMockEvent(tamperedBase64url, { sig })
    expect(() => parseOgRequest(event)).toThrow(RequestParseError)
  })

  it('accepts signature from an old key during rotation', () => {
    const oldKey = 'cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe'
    const base64url = toOgBase64url(GENERIC_PARAMS)
    const path = `/og/${base64url}`
    const sig = signPath(path, [oldKey])
    process.env[SIDELOAD_SIGNING_KEYS_ENV] = `${TEST_SIDELOAD_SIGNING_KEY},${oldKey}`
    const event = createMockEvent(base64url, { sig })
    const result = parseOgRequest(event)
    expect(result.params).toEqual(GENERIC_PARAMS)
  })

  it('rejects unsigned OG requests in staging when signing keys are missing', () => {
    delete process.env[SIDELOAD_SIGNING_KEYS_ENV]
    process.env.ENVIRONMENT = 'staging'
    const base64url = toOgBase64url(GENERIC_PARAMS)
    const event = createMockEvent(base64url)
    let err: RequestParseError | undefined
    try {
      parseOgRequest(event)
    } catch (caught) {
      err = caught as RequestParseError
    }
    expect(err).toBeInstanceOf(RequestParseError)
    expect(err?.statusCode).toBe(403)
  })

  it('keeps unsigned OG requests available outside deployed environments', () => {
    delete process.env[SIDELOAD_SIGNING_KEYS_ENV]
    process.env.NODE_ENV = 'test'
    const base64url = toOgBase64url(GENERIC_PARAMS)
    const event = createMockEvent(base64url)
    expect(parseOgRequest(event).params).toEqual(GENERIC_PARAMS)
  })
})
