import { describe, expect, it } from 'vitest'
import { randomInt } from 'node:crypto'
import {
  createTestUser,
  createTestUrlWithHostname,
  followUser,
  insertTestReferralProgram,
  insertTestUserReferralProgramLink,
} from '@voucha/test-helpers'
import {
  createTestUserReferralProgramLinkIdAt,
  softDeleteReferralLink,
} from '@voucha/test-helpers/entities/referral-links'
import { encodeCursor } from '@modules/pagination'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { getReferralLinksFeed } from './get.mts'

describe('referral feed latest eligible link', () => {
  it('orders representatives by activation before breaking ties by id', async () => {
    const viewer = await createTestUser()
    const author = await createTestUser()
    await followUser(viewer, author)
    const referralProgramId = await insertTestReferralProgram({ createdById: author.id })
    const instant = Date.UTC(1972, 0, 1) + randomInt(1, 1_000_000) * 100
    const ids = [0, 1, 2].map(offset =>
      createTestUserReferralProgramLinkIdAt(new Date(instant + offset)),
    )
    for (const [index, id] of ids.entries()) {
      await insertTestUserReferralProgramLink({
        id,
        userId: author.id,
        referralProgramId,
        urlId: await createTestUrlWithHostname(),
        activatedAt: new Date(instant - (index === 2 ? 10_000 : 0)),
      })
    }

    const page = await getReferralLinksFeed(viewer, 'follow_users', {
      limit: 1,
      after: encodeCursor({ id: createTestUserReferralProgramLinkIdAt(new Date(instant + 3)) }),
    })
    expect(page.results.map(row => row.id)).toEqual([ids[1]])
    expect(page.page_info.has_next_page).toBe(true)
    expect(page.page_info.end_cursor).toBe(encodeCursor({ id: ids[1]! }))
  })

  it('ignores newer hidden children and deleted links when choosing the representative', async () => {
    const viewer = await createTestUser()
    const author = await createTestUser()
    await followUser(viewer, author)
    const referralProgramId = await insertTestReferralProgram({ createdById: author.id })
    const instant = Date.UTC(1972, 0, 1) + randomInt(1, 1_000_000) * 100
    const parent = await insertTestUserReferralProgramLink({
      id: createTestUserReferralProgramLinkIdAt(new Date(instant)),
      userId: author.id,
      referralProgramId,
      urlId: await createTestUrlWithHostname(),
      activatedAt: new Date(instant),
    })
    // An owner without Plus/Pro cannot expose this newer child.
    await insertTestUserReferralProgramLink({
      id: createTestUserReferralProgramLinkIdAt(new Date(instant + 1)),
      userId: author.id,
      referralProgramId,
      urlId: await createTestUrlWithHostname(),
      parentLinkId: parent,
      activatedAt: new Date(instant + 1),
    })
    const deleted = await insertTestUserReferralProgramLink({
      id: createTestUserReferralProgramLinkIdAt(new Date(instant + 2)),
      userId: author.id,
      referralProgramId,
      urlId: await createTestUrlWithHostname(),
      activatedAt: new Date(instant + 2),
    })
    await softDeleteReferralLink(deleted)

    const first = await getReferralLinksFeed(viewer, 'follow_users', {
      limit: 1,
      after: encodeCursor({ id: createTestUserReferralProgramLinkIdAt(new Date(instant + 3)) }),
    })
    expect(first.results.map(row => row.id)).toEqual([parent])
    const terminal = await getReferralLinksFeed(viewer, 'follow_users', {
      limit: 1,
      after: encodeCursor({ id: getMinUUIDv7ForDate(new Date(0)) }),
    })
    expect(terminal.results).toEqual([])
    expect(terminal.page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })
})
