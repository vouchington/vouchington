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

describe('Auth sessions routes with signed UUIDv4 cookies', () => {
  it('rejects UUIDv4 sessions without registering them', async () => {
    const user = await createTestUser()
    const did = legacyUuidV4()
    const sid = legacyUuidV4()
    const deviceToken = await signLegacyDeviceJwt({ did })
    const sessionToken = await signLegacySessionJwt({ did, sid, uid: user.id })

    await createRequest()
      .get('/api/v1/auth/sessions')
      .set('Cookie', [`dt=${deviceToken}`, `st=${sessionToken}`])
      .expect(401)

    await expect(getTestUserSessionById(sid)).resolves.toBeNull()
  })
})
