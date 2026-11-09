import { encodeCursor } from '@modules/pagination'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { insertTestUserReferralProgramLink } from '@voucha/test-helpers/entities/referral-links'
import {
  createReferralProgramFixture,
  disableReferralProgramByTopicId,
} from '@voucha/test-helpers/entities/referral-programs'
import { readReferralProgramRankedLinkCount } from '@voucha/test-helpers/entities/referral-program-link-counts'
import { mergeTopicForTest, softDeleteTopic } from '@voucha/test-helpers/entities/topics'
import { createTestUrlWithHostname } from '@voucha/test-helpers/entities/urls'
import { refreshMaterializedViewForTest } from '@voucha/test-helpers/refresh-materialized-view-for-test'
import { describe, expect, it } from 'vitest'
import { getTopicIds } from './get-ids.mts'

const HIGHEST_ID = 'ffffffff-ffff-7fff-bfff-ffffffffffff'

// The immediately greater UUID places this owned row first among equal-score rows.
function cursorBefore(id: string, score: number): string {
  const hex = (BigInt(`0x${id.replaceAll('-', '')}`) + 1n).toString(16).padStart(32, '0')
  const above = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  return encodeCursor({ score, id: above })
}

async function firstAfter(id: string, score: number) {
  const page = await getTopicIds({ sort: 'link_count', limit: 1, after: cursorBefore(id, score) })
  return page.results[0]?.id
}

describe('referral program link-count ranking', () => {
  it('refreshes counts while applying program and topic eligibility live', async () => {
    const user = await createTestUser()
    const programs = await Promise.all(
      Array.from({ length: 4 }, () => createReferralProgramFixture({ createdById: user.id })),
    )
    const [ranked, disabled, deleted, merged] = programs.map(
      program => program.referralProgramId,
    ) as [string, string, string, string]
    const destination = await createTestTopic({ user })
    const urlId = await createTestUrlWithHostname()
    await refreshMaterializedViewForTest('mv_referral_program_link_counts')
    expect(await readReferralProgramRankedLinkCount(ranked)).toBe(0)
    for (const referralProgramId of [ranked, disabled, deleted, merged]) {
      await insertTestUserReferralProgramLink({ userId: user.id, referralProgramId, urlId })
    }
    // The ranking is deliberately stale until the next refresh.
    expect(await readReferralProgramRankedLinkCount(ranked)).toBe(0)
    expect(await firstAfter(ranked, 1)).not.toBe(ranked)
    await refreshMaterializedViewForTest('mv_referral_program_link_counts')
    expect(await readReferralProgramRankedLinkCount(ranked)).toBe(1)
    for (const id of [ranked, disabled, deleted, merged]) expect(await firstAfter(id, 1)).toBe(id)

    await disableReferralProgramByTopicId(disabled)
    await softDeleteTopic(deleted, user.id)
    await mergeTopicForTest(merged, destination.id, user.id)
    for (const id of [disabled, deleted, merged]) {
      expect(await readReferralProgramRankedLinkCount(id)).toBe(1)
      expect(await firstAfter(id, 1)).not.toBe(id)
    }
    expect(await firstAfter(ranked, 1)).toBe(ranked)
    const page = await getTopicIds({ sort: 'link_count', limit: 1, after: cursorBefore(ranked, 1) })
    expect(page.results[0]?.id).toBe(ranked)
    const next = await getTopicIds({
      sort: 'link_count',
      limit: 1,
      after: page.page_info.end_cursor ?? undefined,
    })
    expect(next.results.some(row => row.id === ranked)).toBe(false)
  })

  it('rejects filtered, unbounded and invalid cursor requests', async () => {
    await expect(getTopicIds({ sort: 'link_count', text_search_query: 'cards' })).rejects.toThrow(
      /does not combine/,
    )
    await expect(getTopicIds({ sort: 'link_count', omitLimit: true })).rejects.toThrow(/page limit/)
    for (const score of [1.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        getTopicIds({ sort: 'link_count', after: encodeCursor({ score, id: HIGHEST_ID }) }),
      ).rejects.toMatchObject({ status: 400 })
    }
  })
})
