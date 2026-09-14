import { beforeAll, describe, expect, it } from 'vitest'
import { encodeCursor } from '@modules/pagination'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestMembership,
  createTestUser,
  updateTestMembershipCancelAtPeriodEnd,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/moderation-transparency', () => {
  let admin: PrivateUser
  let activePlus: PrivateUser
  let pastDuePro: PrivateUser
  let cancellingPlus: PrivateUser
  let pausedPlus: PrivateUser
  let terminalPro: PrivateUser
  let expiredPlus: PrivateUser
  let free: PrivateUser

  beforeAll(async () => {
    ;[admin, activePlus, pastDuePro, cancellingPlus, pausedPlus, terminalPro, expiredPlus, free] =
      await Promise.all([
        createTestUser({ administrator: true }),
        createTestUser(),
        createTestUser(),
        createTestUser(),
        createTestUser(),
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
    const [, , cancellingMembership] = await Promise.all([
      createTestMembership({ user_id: activePlus.id, plan: 'plus', status: 'active' }),
      createTestMembership({ user_id: pastDuePro.id, plan: 'pro', status: 'past_due' }),
      createTestMembership({ user_id: cancellingPlus.id, plan: 'plus', status: 'active' }),
      createTestMembership({ user_id: pausedPlus.id, plan: 'plus', status: 'paused' }),
      createTestMembership({ user_id: terminalPro.id, plan: 'pro', status: 'cancelled' }),
      createTestMembership({ user_id: expiredPlus.id, plan: 'plus', status: 'expired' }),
    ])
    await updateTestMembershipCancelAtPeriodEnd(cancellingMembership.id, true)
  })

  it('requires authentication', async () => {
    await createRequest().get('/api/v1/moderation-transparency').expect(401)
  })

  it('allows administrators and active or past-due Plus/Pro memberships', async () => {
    for (const user of [admin, activePlus, pastDuePro, cancellingPlus]) {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.get('/api/v1/moderation-transparency').expect(200)
    }
  })

  it('denies Free, paused, and terminal memberships after downgrade or cancellation', async () => {
    for (const user of [free, pausedPlus, terminalPro, expiredPlus]) {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.get('/api/v1/moderation-transparency').expect(403)
    }
  })

  it('denies an active paid membership after its expiration time passes', async () => {
    const user = await createTestUser()
    const membership = await createTestMembership({
      user_id: user.id,
      plan: 'plus',
      status: 'active',
    })
    await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 1_000))

    const request = createRequest()
    await request.authenticateAs(user)
    await request.get('/api/v1/moderation-transparency').expect(403)
  })

  it('returns only the sanitized projection contract', async () => {
    const request = createRequest()
    await request.authenticateAs(activePlus)
    const response = await request.get('/api/v1/moderation-transparency').expect(200)
    expect(Object.keys(response.body).sort()).toEqual(['buckets', 'range'])
    expect(response.body.buckets).toEqual(expect.any(Array))
  })

  it('returns 400 for an all-time cursor beyond the UUIDv7 timestamp range', async () => {
    const request = createRequest()
    await request.authenticateAs(activePlus)
    const after = encodeCursor({
      timestamp: 0x1_0000_0000_0000,
      id: '0191ef72-7fd9-7000-8000-000000000001',
      scope: 'moderation-transparency:global:month-desc',
    })

    await request.get(`/api/v1/moderation-transparency?range=all&after=${after}`).expect(400)
  })
})
