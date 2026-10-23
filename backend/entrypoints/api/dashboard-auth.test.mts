import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createIsAdminDashboardRequest, createWorkerSecretValidator } from './dashboard-auth.mts'
import { currentUserCanAccessQueueStats } from '@services/queue-monitoring'
import type { PrivateUser } from '@services/users/types'

function req(headers: IncomingHttpHeaders): IncomingMessage {
  return { headers } as IncomingMessage
}

describe('dashboard auth', () => {
  it('validates the worker secret in constant-shape header flow', () => {
    const isValid = createWorkerSecretValidator('secret-value')
    expect(isValid(req({ 'x-cf-worker-secret': 'secret-value' }))).toBe(true)
    expect(isValid(req({ 'x-cf-worker-secret': 'wrong' }))).toBe(false)
    expect(isValid(req({ 'x-cf-worker-secret': ['secret-value'] }))).toBe(false)
  })

  it('rejects revoked admin sessions', async () => {
    let getUserCalls = 0
    const isAdminDashboardRequest = createIsAdminDashboardRequest({
      verifyDeviceAndSessionTokens: async () => ({ did: 'did', sid: 'sid', uid: 'user-1' }),
      isSessionRevoked: async () => true,
      getPrivateUserByAny: async () => {
        getUserCalls += 1
        return null
      },
      currentUserCanAccessQueueStats: () => true,
    })

    await expect(isAdminDashboardRequest(req({ cookie: 'dt=device; st=session' }))).resolves.toBe(
      false,
    )
    expect(getUserCalls).toBe(0)
  })

  it.each([undefined, 123])(
    'requires original MFA before using current administrator roles (proof=%s)',
    async proof => {
      let receivedUser: PrivateUser | null | undefined
      let revocationOptions:
        | {
            userId?: string | null
            deviceId?: string
            issuedAt?: number
            mfaVerifiedAt?: number | null
          }
        | undefined
      let primaryRead: unknown
      const user = {
        __entity_type: 'user',
        id: 'user-1',
        roles: ['administrator'],
      } as unknown as PrivateUser
      const isAdminDashboardRequest = createIsAdminDashboardRequest({
        verifyDeviceAndSessionTokens: async () => ({
          did: 'did',
          sid: 'sid',
          uid: 'user-1',
          iat: 456,
          device_iat: 123,
          mfa_at: proof,
        }),
        isSessionRevoked: async (_sid, options) => {
          revocationOptions = options
          return false
        },
        getPrivateUserByAny: async (_userId, options) => {
          primaryRead = options
          return user
        },
        currentUserCanAccessQueueStats: currentUser => {
          receivedUser = currentUser
          return currentUserCanAccessQueueStats(currentUser)
        },
      })

      await expect(isAdminDashboardRequest(req({ cookie: 'dt=device; st=session' }))).resolves.toBe(
        proof !== undefined,
      )
      expect(receivedUser?.roles).toEqual(proof === undefined ? [] : ['administrator'])
      expect(primaryRead).toEqual({ readOnly: false })
      expect(revocationOptions).toEqual({
        userId: 'user-1',
        deviceId: 'did',
        issuedAt: 123,
        mfaVerifiedAt: proof ?? null,
      })
    },
  )
})
