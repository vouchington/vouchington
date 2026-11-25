import assert from 'node:assert/strict'
import { encodeCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { searchCopyrightNoticeAssociationTargets } from '@services/copyright-notices/association-search'
import { listCopyrightGuestCapabilityPage } from '@services/copyright-notices/guest-capability-page'
import {
  copyrightNoticesAdditionalMaxValues,
  copyrightSweepConfig,
} from '@services/copyright-notices/work-limits'
import { searchPostsForAdminReview } from '@services/post-clearance/search-review-queue'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import {
  ADMIN_REVIEW_FIXTURE_IDS,
  ASSOCIATION_FIXTURE_COUNT,
  ASSOCIATION_FIXTURE_IDS,
  ASSOCIATION_MATCH_IDS,
  ASSOCIATION_QUERY,
  GUEST_CAPABILITY_FIXTURE_IDS,
  GUEST_CAPABILITY_SEEDED_ROWS,
  seedAdminReviewAndGuestReadFixtures,
} from '../seed-data/admin-review-and-guest-reads.mts'

const PAGE_LIMIT = 100
const moderator = { ...seedUser, roles: ['moderator'] as const }

export async function runAdminReviewAndGuestReadScenarios(): Promise<void> {
  await seedAdminReviewAndGuestReadFixtures(seedUser.id)
  await runAdminReviewQueuePages()
  await runAssociationSearchAtHardCap()
  await runGuestCapabilityPages()
}

async function runAdminReviewQueuePages(): Promise<void> {
  const scenario = 'search-posts-for-admin-review-at-cap'
  const queryName = 'searchPostsForAdminReview'
  registerScenarioContract(scenario, {
    // Each returned post is visited by the queue scan and the clearance projection.
    expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 2 * (PAGE_LIMIT + 1) }],
  })
  await runAndCapture(
    scenario,
    async () => {
      let after: string | undefined
      for (const offset of [0, PAGE_LIMIT]) {
        const page = await searchPostsForAdminReview({ limit: PAGE_LIMIT, after })
        const ids = ADMIN_REVIEW_FIXTURE_IDS.slice(offset, offset + PAGE_LIMIT)
        assert.deepEqual(
          page.results.map(row => row.id),
          ids,
        )
        assert.equal(page.page_info.has_next_page, true)
        after = encodeCursor({ id: ids.at(-1)! })
        assert.equal(page.page_info.end_cursor, after)
      }
    },
    undefined,
    queryName,
    { exactCapturedNames: [queryName, queryName] },
  )
}

async function runAssociationSearchAtHardCap(): Promise<void> {
  const scenario = 'search-copyright-association-at-hard-cap'
  const queryName = 'searchCopyrightNoticeAssociationTargets'
  const key = 'association_search_candidate_rows'
  const previous = copyrightSweepConfig.fields.get(key)
  const candidateLimit = copyrightNoticesAdditionalMaxValues.association_search_candidate_rows
  const matchingIds = new Set(ASSOCIATION_MATCH_IDS)
  const scope = `copyright-notice-association:${ASSOCIATION_QUERY}`
  registerScenarioContract(scenario, {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'copyright_notices', max: candidateLimit + 1 },
    ],
    seededRows: { copyright_notices: ASSOCIATION_FIXTURE_COUNT },
  })
  // Exercise the supported hard maximum (the live default is 100).
  copyrightSweepConfig.fields.set(key, candidateLimit)
  try {
    await runAndCapture(
      scenario,
      async () => {
        let after: string | undefined
        for (const offset of [0, candidateLimit]) {
          const page = await searchCopyrightNoticeAssociationTargets(
            moderator,
            ASSOCIATION_QUERY,
            after,
          )
          const candidates = ASSOCIATION_FIXTURE_IDS.slice(offset, offset + candidateLimit)
          assert.deepEqual(
            page.copyright_notices.map(notice => notice.id),
            candidates.filter(id => matchingIds.has(id)),
          )
          assert.equal(page.page_info.has_next_page, true)
          // The final inspected notice in each window does not match the query.
          after = encodeScopedUuidCursor(candidates.at(-1)!, scope)
          assert.equal(page.page_info.end_cursor, after)
        }
      },
      undefined,
      queryName,
      { exactCapturedNames: [queryName, queryName] },
    )
  } finally {
    if (previous !== undefined) copyrightSweepConfig.fields.set(key, previous)
    else copyrightSweepConfig.fields.delete(key)
  }
}

async function runGuestCapabilityPages(): Promise<void> {
  const scenario = 'list-copyright-guest-capabilities-at-cap'
  const queryName = 'listCopyrightGuestCapabilities'
  const noticeId = ASSOCIATION_FIXTURE_IDS[0]!
  registerScenarioContract(scenario, {
    expectations: [
      // #6414 tracks first-page scans of capabilities from unrelated notices.
      { kind: 'maxProcessedRows', relation: 'copyright_notice_guest_capabilities', max: 501 },
    ],
    seededRows: { copyright_notice_guest_capabilities: GUEST_CAPABILITY_SEEDED_ROWS },
  })
  await runAndCapture(
    scenario,
    async () => {
      const first = await listCopyrightGuestCapabilityPage(moderator, noticeId, {
        limit: PAGE_LIMIT,
      })
      const firstIds = GUEST_CAPABILITY_FIXTURE_IDS.slice(0, PAGE_LIMIT)
      assert.deepEqual(
        first.copyright_guest_capabilities.map(row => row.id),
        firstIds,
      )
      assert.equal(first.page_info.has_next_page, true)
      const after = encodeScopedUuidCursor(
        firstIds.at(-1)!,
        `copyright-guest-capabilities:${noticeId}`,
      )
      assert.equal(first.page_info.end_cursor, after)

      const last = await listCopyrightGuestCapabilityPage(moderator, noticeId, {
        limit: PAGE_LIMIT,
        after,
      })
      assert.deepEqual(
        last.copyright_guest_capabilities.map(row => row.id),
        GUEST_CAPABILITY_FIXTURE_IDS.slice(PAGE_LIMIT),
      )
      assert.equal(last.page_info.has_next_page, false)
      assert.equal(last.page_info.end_cursor, null)
    },
    undefined,
    queryName,
    { exactCapturedNames: [queryName, queryName] },
  )
}
