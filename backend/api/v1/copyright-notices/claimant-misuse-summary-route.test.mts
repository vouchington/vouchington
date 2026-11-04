import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { createTestUser } from '@voucha/test-helpers'
import { suspendTestUser } from '@voucha/test-helpers/entities/users'
import { createRequest } from '@voucha/test-helpers/api/server'

const path = (claimantUserId: string) =>
  `/api/v1/copyright-notices/claimants/${claimantUserId}/misuse-summary`

describe('claimant misuse summary route', () => {
  it('returns a bounded window to copyright review staff without allowing client limit overrides', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const request = createRequest()
    await request.authenticateAs(moderator)
    const claimantUserId = randomUUID()

    const response = await request.get(path(claimantUserId)).expect(200)

    expect(response.headers['cache-control']).toContain('private')
    expect(response.headers['cache-control']).toContain('no-store')
    expect(response.body).toEqual({
      claimant_misuse: {
        notice_withdrawn: 0,
        notice_rejected: 0,
        restriction_reversed_by_counter_notice: 0,
        restriction_reversed_by_appeal: 0,
        notice_count: 0,
        page_info: {
          has_next_page: false,
          start_cursor: null,
          end_cursor: null,
        },
      },
    })
    await request.get(path(claimantUserId)).query({ limit: 1 }).expect(422)
  })

  it('requires an authorized, unsuspended reviewer and a valid claimant id', async () => {
    const member = createRequest()
    await member.authenticateAs(await createTestUser())
    await member.get(path(randomUUID())).expect(403)

    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const suspended = createRequest()
    await suspended.authenticateAs(moderator)
    await suspendTestUser(moderator.id)
    await suspended.get(path(randomUUID())).expect(403)

    const admin = createRequest()
    await admin.authenticateAs(await createTestUser({ administrator: true }))
    await admin.get(path('not-a-uuid')).expect(422)
    await createRequest().get(path(randomUUID())).expect(401)
  })

  it('rejects malformed and claimant-mismatched opaque cursors', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const request = createRequest()
    await request.authenticateAs(moderator)
    const claimantUserId = randomUUID()
    await request.get(path(claimantUserId)).query({ after: 'not-a-cursor' }).expect(400)
    const cursorForOtherClaimant = encodeScopedUuidCursor(
      randomUUID(),
      `copyright-claimant-misuse:${randomUUID()}`,
    )
    await request.get(path(claimantUserId)).query({ after: cursorForOtherClaimant }).expect(400)
  })
})
