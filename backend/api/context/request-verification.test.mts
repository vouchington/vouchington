import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { randomBytes, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppAttestRequestHeaders } from '@voucha/test-helpers/app-attestation-fabricator'
import { appAttestationConfig } from '@services/app-attestation/config'
import type { Context } from '@jongleberry/api-server'
import applyRequestVerificationContext from './request-verification.mts'

const BUNDLE_ID = 'io.voucha.test-fixture'
const NOW_SECONDS = 1_700_000_000
const TEAM_ID = 'TESTTEAM1X'

function getExtensions() {
  const extend = vi.fn<VitestLooseMock>()
  applyRequestVerificationContext({ extend } as never)
  const [extensions] = extend.mock.calls[0]
  return extensions
}

function makeCtx(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    req: {
      headers: {},
      url: '/api/v1/posts',
      method: 'POST',
    },
    request: {
      buffer: vi.fn<VitestLooseMock>().mockResolvedValue(Buffer.alloc(0)),
    },
    getDeviceTokenData: vi.fn<VitestLooseMock>().mockResolvedValue({ did: randomUUID() }),
    reqSigRan: undefined,
    reqSigVerified: undefined,
    reqSigPromise: undefined,
    ...overrides,
  }
}

function asCtx(ctx: Record<string, unknown>): Context {
  return ctx as never
}

describe('verifyAttestedRequestSignature context extension', () => {
  beforeEach(() => {
    vi.stubEnv('APPLE_APP_ATTEST_TEAM_ID', TEAM_ID)
    vi.stubEnv('APPLE_APP_ATTEST_BUNDLE_ID', BUNDLE_ID)
    vi.setSystemTime(NOW_SECONDS * 1000)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  describe("mode = 'off'", () => {
    it('is a no-op regardless of headers', async () => {
      overrideDynamicConfigFieldsForTest(appAttestationConfig, { request_signing_mode: 'off' })
      const extensions = getExtensions()
      const ctx = makeCtx()
      Object.assign(ctx, extensions)

      await expect(asCtx(ctx).verifyAttestedRequestSignature()).resolves.toBeUndefined()
      expect(ctx.reqSigVerified).toBeUndefined()
    })
  })

  describe("mode = 'observe'", () => {
    it('is a no-op when attestation headers are absent', async () => {
      overrideDynamicConfigFieldsForTest(appAttestationConfig, { request_signing_mode: 'observe' })
      const extensions = getExtensions()
      const ctx = makeCtx()
      Object.assign(ctx, extensions)

      await expect(asCtx(ctx).verifyAttestedRequestSignature()).resolves.toBeUndefined()
      expect(ctx.reqSigVerified).toBeUndefined()
    })

    it('logs and returns when attested device omits signing headers', async () => {
      overrideDynamicConfigFieldsForTest(appAttestationConfig, { request_signing_mode: 'observe' })
      const extensions = getExtensions()
      const ctx = makeCtx({
        getDeviceTokenData: vi.fn<VitestLooseMock>().mockResolvedValue({
          did: randomUUID(),
          dc: 'attested',
        }),
      })
      Object.assign(ctx, extensions)

      await expect(asCtx(ctx).verifyAttestedRequestSignature()).resolves.toBeUndefined()
      expect(ctx.reqSigVerified).toBeUndefined()
    })

    it('swallows verification errors and leaves reqSigVerified unset', async () => {
      overrideDynamicConfigFieldsForTest(appAttestationConfig, { request_signing_mode: 'observe' })
      const extensions = getExtensions()
      const ctx = makeCtx({
        req: {
          headers: {
            'x-app-attest-key-id': randomBytes(32).toString('base64'),
            'x-app-attest-assertion': Buffer.from('invalid-cbor').toString('base64'),
            'x-app-attest-timestamp': String(NOW_SECONDS),
            'x-app-attest-nonce': randomBytes(16).toString('hex'),
          },
          url: '/api/v1/session',
          method: 'GET',
        },
        getDeviceTokenData: vi.fn<VitestLooseMock>().mockResolvedValue({
          did: randomUUID(),
          dc: 'attested',
        }),
      })
      Object.assign(ctx, extensions)

      await expect(asCtx(ctx).verifyAttestedRequestSignature()).resolves.toBeUndefined()
      expect(ctx.reqSigVerified).toBeUndefined()
    })
  })

  describe("mode = 'enforce'", () => {
    it('is a no-op for unattested devices even when headers are absent', async () => {
      overrideDynamicConfigFieldsForTest(appAttestationConfig, { request_signing_mode: 'enforce' })
      const extensions = getExtensions()
      // No dc property → unattested device (web browser, unauthenticated native, etc.)
      const ctx = makeCtx()
      Object.assign(ctx, extensions)

      await expect(asCtx(ctx).verifyAttestedRequestSignature()).resolves.toBeUndefined()
      expect(ctx.reqSigVerified).toBeUndefined()
    })

    it('requires signing headers when an attested request only has a challenge ID', async () => {
      overrideDynamicConfigFieldsForTest(appAttestationConfig, { request_signing_mode: 'enforce' })
      const extensions = getExtensions()
      const ctx = makeCtx({
        req: { headers: { 'x-app-attest-challenge-id': 'challenge-id' } },
        getDeviceTokenData: vi.fn<VitestLooseMock>().mockResolvedValue({
          did: randomUUID(),
          dc: 'attested',
        }),
      })
      Object.assign(ctx, extensions)

      await expect(asCtx(ctx).verifyAttestedRequestSignature()).rejects.toMatchObject({
        code: 'ATTESTATION_SIGNATURE_REQUIRED',
        status: 403,
      })
    })

    it('sets reqSigVerified on a valid assertion', async () => {
      overrideDynamicConfigFieldsForTest(appAttestationConfig, { request_signing_mode: 'enforce' })
      const extensions = getExtensions()
      const did = randomUUID()
      const method = 'POST'
      const path = '/api/v1/posts'
      const body = Buffer.from('{}')
      const h = await createAppAttestRequestHeaders({
        did,
        method,
        path,
        body,
        timestamp: NOW_SECONDS,
      })
      const ctx = makeCtx({
        req: {
          headers: {
            'x-app-attest-key-id': h['x-app-attest-key-id'],
            'x-app-attest-assertion': h['x-app-attest-assertion'],
            'x-app-attest-timestamp': h['x-app-attest-timestamp'],
            'x-app-attest-nonce': h['x-app-attest-nonce'],
          },
          url: path,
          method,
        },
        request: {
          buffer: vi.fn<VitestLooseMock>().mockResolvedValue(body),
        },
        getDeviceTokenData: vi.fn<VitestLooseMock>().mockResolvedValue({ did, dc: 'attested' }),
      })
      Object.assign(ctx, extensions)

      await asCtx(ctx).verifyAttestedRequestSignature()
      expect(ctx.reqSigVerified).toBe(true)
    })

    it('throws ATTESTATION_REJECTED on an invalid assertion without swallowing', async () => {
      overrideDynamicConfigFieldsForTest(appAttestationConfig, { request_signing_mode: 'enforce' })
      const extensions = getExtensions()
      const ctx = makeCtx({
        req: {
          headers: {
            'x-app-attest-key-id': randomBytes(32).toString('base64'),
            'x-app-attest-assertion': Buffer.from('not-cbor').toString('base64'),
            'x-app-attest-timestamp': String(NOW_SECONDS),
            'x-app-attest-nonce': randomBytes(16).toString('hex'),
          },
          url: '/api/v1/session',
          method: 'GET',
        },
        getDeviceTokenData: vi.fn<VitestLooseMock>().mockResolvedValue({
          did: randomUUID(),
          dc: 'attested',
        }),
      })
      Object.assign(ctx, extensions)

      await expect(asCtx(ctx).verifyAttestedRequestSignature()).rejects.toMatchObject({
        code: 'ATTESTATION_REJECTED',
        status: 403,
      })
    })
  })

  describe('memoization', () => {
    it('runs verification only once for concurrent calls', async () => {
      overrideDynamicConfigFieldsForTest(appAttestationConfig, { request_signing_mode: 'enforce' })
      const extensions = getExtensions()
      const did = randomUUID()
      const h = await createAppAttestRequestHeaders({
        did,
        method: 'GET',
        path: '/api/v1/session',
        timestamp: NOW_SECONDS,
      })
      const ctx = makeCtx({
        req: {
          headers: {
            'x-app-attest-key-id': h['x-app-attest-key-id'],
            'x-app-attest-assertion': h['x-app-attest-assertion'],
            'x-app-attest-timestamp': h['x-app-attest-timestamp'],
            'x-app-attest-nonce': h['x-app-attest-nonce'],
          },
          url: '/api/v1/session',
          method: 'GET',
        },
        getDeviceTokenData: vi.fn<VitestLooseMock>().mockResolvedValue({ did, dc: 'attested' }),
      })
      Object.assign(ctx, extensions)

      const verify = () => asCtx(ctx).verifyAttestedRequestSignature()
      await Promise.all([verify(), verify(), verify()])
      expect(
        (ctx.getDeviceTokenData as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBeLessThanOrEqual(2)
    })

    it('is a no-op on the second call after reqSigRan is set', async () => {
      overrideDynamicConfigFieldsForTest(appAttestationConfig, { request_signing_mode: 'off' })
      const extensions = getExtensions()
      const ctx = makeCtx()
      Object.assign(ctx, extensions)

      const verify = () => asCtx(ctx).verifyAttestedRequestSignature()
      await verify()
      expect(ctx.reqSigRan).toBe(true)
      ctx.reqSigVerified = undefined
      await verify()
      expect((ctx.getDeviceTokenData as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
    })
  })

  describe('hasVerifiedRequestSignature', () => {
    it('returns false before verification', () => {
      const extensions = getExtensions()
      const ctx = makeCtx()
      Object.assign(ctx, extensions)
      expect(asCtx(ctx).hasVerifiedRequestSignature()).toBe(false)
    })

    it('returns true after successful enforce-mode verification', async () => {
      overrideDynamicConfigFieldsForTest(appAttestationConfig, { request_signing_mode: 'enforce' })
      const extensions = getExtensions()
      const did = randomUUID()
      const h = await createAppAttestRequestHeaders({
        did,
        method: 'GET',
        path: '/api/v1/session',
        timestamp: NOW_SECONDS,
      })
      const ctx = makeCtx({
        req: {
          headers: {
            'x-app-attest-key-id': h['x-app-attest-key-id'],
            'x-app-attest-assertion': h['x-app-attest-assertion'],
            'x-app-attest-timestamp': h['x-app-attest-timestamp'],
            'x-app-attest-nonce': h['x-app-attest-nonce'],
          },
          url: '/api/v1/session',
          method: 'GET',
        },
        getDeviceTokenData: vi.fn<VitestLooseMock>().mockResolvedValue({ did, dc: 'attested' }),
      })
      Object.assign(ctx, extensions)

      await asCtx(ctx).verifyAttestedRequestSignature()
      expect(asCtx(ctx).hasVerifiedRequestSignature()).toBe(true)
    })
  })
})
