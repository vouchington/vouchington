import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { createUniqueTestEmail, insertEmailAddressLoginToken } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { insertTestUserSession } from '../../../../test-helpers/entities/user-sessions.mts'
import { encodeScopedPreciseTimestampCursor } from '@modules/pagination'
import '../index.mts'

describe('GET /api/v1/auth/sessions pagination', () => {
  it('orders by recent activity and rejects a cursor from another owner scope', async () => {
    const emailAddress = createUniqueTestEmail('session-pagination')
    const loginToken = v7()
    await insertEmailAddressLoginToken(emailAddress, loginToken)
    const login = await createRequest()
      .post('/api/v1/auth/email-address/login')
      .send({ emailAddress, token: loginToken })
      .expect(200)
    const cookies = login.headers['set-cookie'] as unknown as string[]
    const authCookies = cookies.filter(
      cookie => cookie.startsWith('dt=') || cookie.startsWith('st='),
    )
    const olderSession = await insertTestUserSession({
      userId: login.body.user.id,
      sessionId: v7(),
      deviceId: v7(),
      deviceName: 'Older session',
    })

    const response = await createRequest()
      .get('/api/v1/auth/sessions')
      .set('Cookie', authCookies)
      .expect(200)
    expect(response.body.results[0].id).toBe(login.body.session.sid)

    const wrongScope = encodeScopedPreciseTimestampCursor(
      '2026-07-18T00:00:00.000000Z',
      olderSession.id,
      'auth-sessions:another-user:last-seen-desc-id-desc',
    )
    await createRequest()
      .get(`/api/v1/auth/sessions?after=${encodeURIComponent(wrongScope)}`)
      .set('Cookie', authCookies)
      .expect(400)
  })
})
