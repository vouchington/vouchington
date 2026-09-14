import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  legacyUuidV4,
  signLegacyDeviceJwt,
  signLegacySessionJwt,
} from '@voucha/test-helpers/services/jwt-session/index'
import { getTestUserSessionById } from '../../../../test-helpers/entities/user-sessions.mts'
import '../index.mts'

describe('Auth sessions routes legacy cookies', () => {
  it('does not register legacy UUIDv4 sessions in the partitioned registry', async () => {
    const user = await createTestUser()
    const did = legacyUuidV4()
    const sid = legacyUuidV4()
    const deviceToken = await signLegacyDeviceJwt({ did })
    const sessionToken = await signLegacySessionJwt({ did, sid, uid: user.id })

    const response = await createRequest()
      .get('/api/v1/auth/sessions')
      .set('Cookie', [`dt=${deviceToken}`, `st=${sessionToken}`])
      .expect(200)

    expect(response.body.results).toEqual([])
    await expect(getTestUserSessionById(sid)).resolves.toBeNull()
  })
})
