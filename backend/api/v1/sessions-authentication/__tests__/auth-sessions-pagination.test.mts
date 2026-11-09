import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  beginTransaction,
  createUniqueTestEmail,
  insertEmailAddressLoginToken,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { installEmailDomainDnsMock } from '@voucha/test-helpers/email-domain-dns'
import { insertTestUserSession } from '../../../../test-helpers/entities/user-sessions.mts'
import { encodeScopedPreciseTimestampCursor } from '@modules/pagination'
import { seedSessionRevocationCutoffOverflow } from '@voucha/test-helpers/session-revocation-cutoff'
import { sessionLimitsMaxValues } from '@services/jwt-session/session-limits-config'
import { revokeOtherAuthenticatedSessions } from '@services/jwt-session/user-session-revocation'
import '../index.mts'

describe('GET /api/v1/auth/sessions pagination', () => {
  installEmailDomainDnsMock()

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
      lastSeenAt: new Date(Date.now() - 60_000),
    })

    const response = await createRequest()
      .get('/api/v1/auth/sessions')
      .set('Cookie', authCookies)
      .expect(200)
    expect(response.body.results[0].id).toBe(login.body.session.sid)

    const firstPage = await createRequest()
      .get('/api/v1/auth/sessions?limit=1')
      .set('Cookie', authCookies)
      .expect(200)
    expect(firstPage.body.results.map((session: { id: string }) => session.id)).toEqual([
      login.body.session.sid,
    ])
    expect(firstPage.body.page_info.has_next_page).toBe(true)
    const nextCursor = firstPage.body.page_info.end_cursor as string
    const secondPage = await createRequest()
      .get(`/api/v1/auth/sessions?limit=1&after=${encodeURIComponent(nextCursor)}`)
      .set('Cookie', authCookies)
      .expect(200)
    expect(secondPage.body.results.map((session: { id: string }) => session.id)).toEqual([
      olderSession.id,
    ])
    expect(secondPage.body.page_info.has_next_page).toBe(false)

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

  it('returns a continuation for an empty revoked page before a valid preserved session', async () => {
    const emailAddress = createUniqueTestEmail('session-cutoff-pagination')
    const token = v7()
    await insertEmailAddressLoginToken(emailAddress, token)
    const login = await createRequest()
      .post('/api/v1/auth/email-address/login')
      .send({ emailAddress, token })
      .expect(200)
    const cookies = (login.headers['set-cookie'] as unknown as string[]).filter(
      cookie => cookie.startsWith('dt=') || cookie.startsWith('st='),
    )
    const userId: string = login.body.user.id
    const sid: string = login.body.session.sid
    await seedSessionRevocationCutoffOverflow(
      userId,
      2 * sessionLimitsMaxValues.active_sessions_per_user + 1,
    )
    await using query = await beginTransaction()
    await revokeOtherAuthenticatedSessions(userId, sid, { query })
    await query.commit()

    const first = await createRequest()
      .get('/api/v1/auth/sessions')
      .set('Cookie', cookies)
      .expect(200)
    expect(first.body.results).toEqual([])
    expect(first.body.page_info.has_next_page).toBe(true)
    expect(first.body.page_info.end_cursor).toBeTypeOf('string')
    const after = encodeURIComponent(first.body.page_info.end_cursor as string)
    const second = await createRequest()
      .get(`/api/v1/auth/sessions?after=${after}`)
      .set('Cookie', cookies)
      .expect(200)
    expect(second.body.results.map((session: { id: string }) => session.id)).toEqual([sid])
    expect(second.body.page_info.has_next_page).toBe(false)
  })
})
