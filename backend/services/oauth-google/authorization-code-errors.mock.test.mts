import { afterAll, afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { createRandomString } from '@voucha/test-helpers'
import { randomUUID } from 'node:crypto'
import { Response, type fetch as undiciFetch } from 'undici'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
  markTestOAuthAuthorizationExchanging,
} from '@voucha/test-helpers/entities/oauth-authorizations'

const googleClientId = 'google-oauth-test-client'
const fetchSpy = vi.fn<typeof undiciFetch>()

vi.resetModules()
vi.doMock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const { getGoogleAccountByGoogleUserId, upsertGoogleAuthorizationCodeAccount } =
  await import('./index.mts')

describe('Google OAuth authorization-code failures', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_CLIENT_ID', googleClientId)
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'google-server-secret')
  })

  afterEach(() => {
    fetchSpy.mockReset()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  afterAll(() => {
    vi.doUnmock('undici')
  })

  it.each(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const)(
    'rejects before fetch when %s is missing',
    async key => {
      const googleUserId = `google-missing-config-${createRandomString(12)}`
      const { authorizationId, authorizationClaimId } =
        await beginGoogleAuthorizationExchange(googleUserId)
      vi.stubEnv(key, '')

      await expect(
        upsertGoogleAuthorizationCodeAccount(
          'authorization-code',
          'https://example.com/auth/callback/google/broker',
          'server-pkce-verifier',
          { authorizationId, authorizationClaimId },
        ),
      ).rejects.toThrow('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be defined')

      expect(fetchSpy).not.toHaveBeenCalled()
      expect(await getGoogleAccountByGoogleUserId(googleUserId)).toBeNull()
      expect(await getTestOAuthAuthorization(authorizationId)).toMatchObject({
        status: 'exchanging',
        google_account_id: null,
        exchange_claim_id: authorizationClaimId,
      })
    },
  )

  it.each(['resolve', 'reject', 'null'] as const)(
    'cancels token failure bodies (%s) and preserves 502',
    async mode => {
      const googleUserId = `google-token-http-error-${createRandomString(12)}`
      const { authorizationId, authorizationClaimId } =
        await beginGoogleAuthorizationExchange(googleUserId)
      const cancellationError = new Error('Google token error-body cancellation failed')
      const cancel = vi.fn<() => Promise<void>>(() =>
        mode === 'reject' ? Promise.reject(cancellationError) : Promise.resolve(),
      )
      const response = new Response(mode === 'null' ? null : new ReadableStream({ cancel }), {
        status: 400,
      })
      const reported =
        mode === 'reject'
          ? new Promise<unknown>(resolve => {
              sentryCaptureExceptionMock.mockImplementationOnce(error => {
                resolve(error)
                return 'test-event-id'
              })
            })
          : undefined
      fetchSpy.mockResolvedValueOnce(response)

      await expect(
        upsertGoogleAuthorizationCodeAccount(
          'authorization-code',
          'https://example.com/auth/callback/google/broker',
          'server-pkce-verifier',
          { authorizationId, authorizationClaimId },
        ),
      ).rejects.toMatchObject({ status: 502 })

      expect(cancel).toHaveBeenCalledTimes(mode === 'null' ? 0 : 1)
      expect(reported ? await reported : undefined).toBe(
        mode === 'reject' ? cancellationError : undefined,
      )
      expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(mode === 'reject' ? 1 : 0)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://oauth2.googleapis.com/token')
      expect(await getGoogleAccountByGoogleUserId(googleUserId)).toBeNull()
      expect(await getTestOAuthAuthorization(authorizationId)).toMatchObject({
        status: 'exchanging',
        google_account_id: null,
        exchange_claim_id: authorizationClaimId,
      })
    },
  )

  it.each(['resolve', 'reject', 'null'] as const)(
    'cancels UserInfo failure bodies (%s) and preserves 502',
    async mode => {
      const googleUserId = `google-userinfo-http-error-${createRandomString(12)}`
      const { authorizationId, authorizationClaimId } =
        await beginGoogleAuthorizationExchange(googleUserId)
      const cancellationError = new Error('Google UserInfo error-body cancellation failed')
      const cancel = vi.fn<() => Promise<void>>(() =>
        mode === 'reject' ? Promise.reject(cancellationError) : Promise.resolve(),
      )
      const response = new Response(mode === 'null' ? null : new ReadableStream({ cancel }), {
        status: 503,
      })
      const reported =
        mode === 'reject'
          ? new Promise<unknown>(resolve => {
              sentryCaptureExceptionMock.mockImplementationOnce(error => {
                resolve(error)
                return 'test-event-id'
              })
            })
          : undefined
      fetchSpy
        .mockResolvedValueOnce(Response.json({ access_token: 'google-access-token' }))
        .mockResolvedValueOnce(response)

      await expect(
        upsertGoogleAuthorizationCodeAccount(
          'authorization-code',
          'https://example.com/auth/callback/google/broker',
          'server-pkce-verifier',
          { authorizationId, authorizationClaimId },
        ),
      ).rejects.toMatchObject({ status: 502 })

      expect(cancel).toHaveBeenCalledTimes(mode === 'null' ? 0 : 1)
      expect(reported ? await reported : undefined).toBe(
        mode === 'reject' ? cancellationError : undefined,
      )
      expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(mode === 'reject' ? 1 : 0)
      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
        'https://oauth2.googleapis.com/token',
        'https://openidconnect.googleapis.com/v1/userinfo',
      ])
      expect(await getGoogleAccountByGoogleUserId(googleUserId)).toBeNull()
      expect(await getTestOAuthAuthorization(authorizationId)).toMatchObject({
        status: 'exchanging',
        google_account_id: null,
        exchange_claim_id: authorizationClaimId,
      })
    },
  )
})

async function beginGoogleAuthorizationExchange(googleUserId: string) {
  const authorizationId = await insertTestOAuthAuthorization({ provider: 'google' })
  const authorizationClaimId = randomUUID()
  onTestFinished(() =>
    deleteTestOAuthAuthorizationFixtures({
      authorizationIds: [authorizationId],
      googleUserIds: [googleUserId],
    }),
  )
  await markTestOAuthAuthorizationExchanging(authorizationId, authorizationClaimId)
  return { authorizationId, authorizationClaimId }
}
