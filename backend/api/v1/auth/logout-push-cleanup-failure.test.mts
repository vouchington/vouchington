import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import {
  createDeviceAndSessionTokens,
  isSessionRevoked,
  verifyDeviceAndSessionTokens,
} from '@services/jwt-session'
import * as notifications from '@services/notifications'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { v7 } from 'uuid'

describe('POST /api/v1/auth/logout push cleanup failure', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reports the failure while still revoking the session and clearing cookies', async () => {
    const user = await createTestUser()
    const tokens = await createDeviceAndSessionTokens({ did: v7(), sid: v7(), uid: user.id })
    const cleanupError = new Error('push cleanup unavailable')
    vi.spyOn(notifications, 'deleteExactWebPushSubscription').mockRejectedValueOnce(cleanupError)

    const response = await createRequest()
      .post('/api/v1/auth/logout')
      .set('Cookie', [`dt=${tokens.deviceToken.token}`, `st=${tokens.sessionToken.token}`])
      .set('Sec-Fetch-Site', 'same-origin')
      .send({
        web_push_endpoint: `https://push.example.test/${crypto.randomUUID()}`,
        web_push_subscription_id: crypto.randomUUID(),
      })
      .expect(204)

    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(cleanupError, expect.any(Object))
    const cookies = response.headers['set-cookie'] as unknown as string[] | undefined
    expect(cookies).toEqual(
      expect.arrayContaining([expect.stringContaining('dt=;'), expect.stringContaining('st=;')]),
    )
    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: tokens.deviceToken.token,
      sessionToken: tokens.sessionToken.token,
    })
    expect(verified).not.toBe(false)
    await expect(isSessionRevoked((verified as Exclude<typeof verified, false>).sid)).resolves.toBe(
      true,
    )
  })
})
