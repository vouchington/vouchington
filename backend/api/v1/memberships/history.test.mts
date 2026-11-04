import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { paginationConfig } from '@services/pagination'
import { recordMembershipChange } from '@services/memberships/changes'
import type { PrivateUser } from '@services/users/types'

// Authorization and empty-page behavior are covered in __tests__/index.part-2.test.mts.
describe('membership history pagination', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('pages older changes without repeating rows when a new change arrives', async () => {
    const user = await createTestUser()
    const membership = await createTestMembership({ user_id: user.id })
    for (const note of ['older', 'newer']) {
      await recordMembershipChange({
        membershipId: membership.id,
        userId: user.id,
        changeType: 'admin_grant',
        note,
      })
    }
    const request = createRequest()
    await request.authenticateAs(admin)
    const first = await request.get(`/api/v1/memberships/history/${user.id}?limit=2`).expect(200)
    expect(first.body.results.map((change: { note: string | null }) => change.note)).toEqual([
      'newer',
      'older',
    ])
    expect(first.body.page_info).toEqual({
      has_next_page: true,
      start_cursor: expect.any(String),
      end_cursor: expect.any(String),
    })
    await recordMembershipChange({
      membershipId: membership.id,
      userId: user.id,
      changeType: 'admin_grant',
      note: 'latest',
    })
    const second = await request
      .get(`/api/v1/memberships/history/${user.id}`)
      .query({ limit: 2, after: first.body.page_info.end_cursor })
      .expect(200)
    expect(second.body.results).toHaveLength(1)
    expect(second.body.results[0]).toMatchObject({ user_id: user.id, membership_id: membership.id })
    expect(first.body.results.map((change: { id: string }) => change.id)).not.toContain(
      second.body.results[0].id,
    )
    expect(second.body.page_info).toEqual({
      has_next_page: false,
      start_cursor: expect.any(String),
      end_cursor: null,
    })
    const fresh = await request.get(`/api/v1/memberships/history/${user.id}`).expect(200)
    expect(fresh.body.results.map((change: { note: string | null }) => change.note)).toEqual([
      'latest',
      'newer',
      'older',
      null,
    ])
  })

  it('uses the runtime default and clamps the requested limit to the runtime maximum', async () => {
    const user = await createTestUser()
    const membership = await createTestMembership({ user_id: user.id })
    await recordMembershipChange({
      membershipId: membership.id,
      userId: user.id,
      changeType: 'admin_grant',
    })
    await recordMembershipChange({
      membershipId: membership.id,
      userId: user.id,
      changeType: 'admin_grant',
    })
    const request = createRequest()
    await request.authenticateAs(admin)
    const restore = overrideDynamicConfigFieldsForTest(paginationConfig, {
      default_limit: 1,
      max_limit: 2,
    })
    try {
      const first = await request.get(`/api/v1/memberships/history/${user.id}`).expect(200)
      expect(first.body.results).toHaveLength(1)
      expect(first.body.page_info.has_next_page).toBe(true)
      const bounded = await request
        .get(`/api/v1/memberships/history/${user.id}`)
        .query({ limit: 1000 })
        .expect(200)
      expect(bounded.body.results).toHaveLength(2)
      expect(bounded.body.page_info.has_next_page).toBe(true)
    } finally {
      restore()
    }
  })

  it('rejects invalid cursors and cursors for a different user', async () => {
    const user = await createTestUser()
    const otherUser = await createTestUser()
    await createTestMembership({ user_id: user.id })
    const request = createRequest()
    await request.authenticateAs(admin)
    const first = await request.get(`/api/v1/memberships/history/${user.id}`).expect(200)
    await request
      .get(`/api/v1/memberships/history/${user.id}`)
      .query({ after: 'invalid-cursor' })
      .expect(400)
    await request
      .get(`/api/v1/memberships/history/${otherUser.id}`)
      .query({ after: first.body.page_info.start_cursor })
      .expect(400)
  })

  it.each(['0', '-1', '1.5', 'invalid'])('rejects invalid page limit %s', async limit => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get(`/api/v1/memberships/history/${user.id}`).query({ limit }).expect(400)
  })
})
