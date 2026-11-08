import { encodeCursor } from '@modules/pagination'
import { createTestUser } from '@voucha/test-helpers'
import {
  insertTestUserReferralProgramLink,
  softDeleteReferralLink,
} from '@voucha/test-helpers/entities/referral-links'
import { createTestUrlWithHostname, hardDeleteTestUrl } from '@voucha/test-helpers/entities/urls'
import {
  createReferralProgramFixture,
  disableReferralProgramByTopicId,
} from '@voucha/test-helpers/entities/referral-programs'
import {
  deactivateReferralLinkForCount,
  readHighestActiveLinkCount,
  readReferralProgramActiveLinkCount,
  setReferralProgramActiveLinkCountForTest,
} from '@voucha/test-helpers/entities/referral-program-link-counts'
import { hardDeleteTestTopic, softDeleteTopic } from '@voucha/test-helpers/entities/topics'
import { hardDeleteTestUser } from '@voucha/test-helpers/entities/users-lifecycle'
import { describe, expect, it } from 'vitest'
import { getTopicIds } from './get-ids.mts'

const HIGHEST_ID = 'ffffffff-ffff-7fff-bfff-ffffffffffff'

async function insertActiveLink(
  userId: string,
  referralProgramId: string,
): Promise<{ id: string; urlId: string }> {
  const urlId = await createTestUrlWithHostname()
  const id = await insertTestUserReferralProgramLink({ userId, referralProgramId, urlId })
  return { id, urlId }
}

describe('active link count', () => {
  it('stays exact when a link owner is purged and when a link is deactivated, deleted, or cascaded', async () => {
    const creator = await createTestUser()
    const owner = await createTestUser()
    const other = await createTestUser()
    const program = await createReferralProgramFixture({ createdById: creator.id })
    await insertActiveLink(owner.id, program.referralProgramId)
    const kept = await insertActiveLink(other.id, program.referralProgramId)

    expect(await readReferralProgramActiveLinkCount(program.referralProgramId)).toBe(2)

    await hardDeleteTestUser(owner.id)
    expect(await readReferralProgramActiveLinkCount(program.referralProgramId)).toBe(1)

    await deactivateReferralLinkForCount(kept.id)
    expect(await readReferralProgramActiveLinkCount(program.referralProgramId)).toBe(0)

    const again = await insertActiveLink(other.id, program.referralProgramId)
    expect(await readReferralProgramActiveLinkCount(program.referralProgramId)).toBe(1)
    await softDeleteReferralLink(again.id)
    expect(await readReferralProgramActiveLinkCount(program.referralProgramId)).toBe(0)

    const cascaded = await insertActiveLink(other.id, program.referralProgramId)
    await hardDeleteTestUrl(cascaded.urlId)
    expect(await readReferralProgramActiveLinkCount(program.referralProgramId)).toBe(0)

    const purged = await createReferralProgramFixture({ createdById: creator.id })
    await insertActiveLink(other.id, purged.referralProgramId)
    await hardDeleteTestTopic(purged.referralProgramId)
    expect(await readReferralProgramActiveLinkCount(purged.referralProgramId)).toBeNull()
  })

  it('decrements the count when an active link is deleted after the program topic is soft-deleted', async () => {
    const creator = await createTestUser()
    const owner = await createTestUser()
    const program = await createReferralProgramFixture({ createdById: creator.id })
    await insertActiveLink(owner.id, program.referralProgramId)
    expect(await readReferralProgramActiveLinkCount(program.referralProgramId)).toBe(1)

    await softDeleteTopic(program.referralProgramId, creator.id)
    await hardDeleteTestUser(owner.id)

    expect(await readReferralProgramActiveLinkCount(program.referralProgramId)).toBe(0)
  })

  it('fills a link-count page after a higher program topic is soft-deleted', async () => {
    const creator = await createTestUser()
    const count = (await readHighestActiveLinkCount()) + 1
    const first = await createReferralProgramFixture({ createdById: creator.id })
    const second = await createReferralProgramFixture({ createdById: creator.id })
    const hidden = await createReferralProgramFixture({ createdById: creator.id })
    const disabled = await createReferralProgramFixture({ createdById: creator.id })
    const tail = await createReferralProgramFixture({ createdById: creator.id })
    const topicIds = [
      first.referralProgramId,
      second.referralProgramId,
      hidden.referralProgramId,
      disabled.referralProgramId,
      tail.referralProgramId,
    ]
    try {
      for (const topicId of topicIds.slice(0, 4)) {
        await setReferralProgramActiveLinkCountForTest(topicId, count)
      }
      await disableReferralProgramByTopicId(disabled.referralProgramId)
      await softDeleteTopic(hidden.referralProgramId, creator.id)

      const page = await getTopicIds({ sort: 'link_count', limit: 2 })
      expect(page.results.map(row => row.id)).toEqual([
        second.referralProgramId,
        first.referralProgramId,
      ])
      expect(page.page_info.has_next_page).toBe(true)

      const cursorPage = await getTopicIds({
        sort: 'link_count',
        limit: 1,
        after: encodeCursor({ score: count, id: HIGHEST_ID }),
      })
      expect(cursorPage.results.map(row => row.id)).toEqual([second.referralProgramId])
      const next = await getTopicIds({
        sort: 'link_count',
        limit: 1,
        after: cursorPage.page_info.end_cursor ?? undefined,
      })
      expect(next.results.map(row => row.id)).toEqual([first.referralProgramId])
    } finally {
      for (const topicId of topicIds) await hardDeleteTestTopic(topicId)
    }
  })

  it('rejects a link-count page that is filtered, unbounded, or cursor-shaped for another sort', async () => {
    await expect(getTopicIds({ sort: 'link_count', text_search_query: 'cards' })).rejects.toThrow(
      /does not combine/,
    )
    await expect(getTopicIds({ sort: 'link_count', omitLimit: true })).rejects.toThrow(/page limit/)
    await expect(
      getTopicIds({ sort: 'link_count', after: encodeCursor({ score: 1.5, id: HIGHEST_ID }) }),
    ).rejects.toThrow(/Invalid cursor/)
  })
})
