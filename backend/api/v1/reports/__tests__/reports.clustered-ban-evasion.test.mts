import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestSystemModerationReport,
  setTestBanEvasionFlag,
} from '@voucha/test-helpers'
import { acquireReportPaginationTestLock } from '@voucha/test-helpers/report-pagination-lock'
import type { PrivateUser } from '@services/users/types'

// The shared staff report queue is dirty and parallel: other tests leave pending reports behind
// and never clean up (see backend/test-helpers/CLAUDE.md). A single `limit=100` fetch assuming
// this test's own cluster lands within the first page is a top-of-sort race with no bound on how
// much ambient noise can crowd it out. Seek forward instead, bounded by MAX_SEEK_PAGES rather than
// an assumed page count.
const SEEK_LIMIT = 100
const MAX_SEEK_PAGES = 200

describe('GET /api/v1/reports?cluster=entity ban evasion', () => {
  let releaseLock: () => Promise<void>
  let adminUser: PrivateUser

  beforeAll(async () => {
    const lock = await acquireReportPaginationTestLock()
    releaseLock = () => lock.release()
    adminUser = await createTestUser({ administrator: true })
  })
  afterAll(() => releaseLock())

  it('includes ban-evasion context on clustered staff reports', async () => {
    const suspect = await createTestUser()
    const source = await createTestUser()
    const community = await insertTestCommunity({ createdById: adminUser.id })
    await insertTestCommunityMember({ communityId: community.id, userId: suspect.id })
    await setTestBanEvasionFlag({
      communityId: community.id,
      userId: suspect.id,
      sourceUserId: source.id,
      score: 0.93,
    })
    const reportId = await insertTestSystemModerationReport(
      'user',
      suspect.id,
      'Suspected ban evasion',
      new Date(),
    )

    const request = createRequest()
    await request.authenticateAs(adminUser)
    const cluster = await seekOwnedCluster(request, suspect.id)
    const report = cluster?.reports.find((item: { id: string }) => item.id === reportId)

    expect(report).toMatchObject({
      id: reportId,
      is_system_generated: true,
      community_ban_evasion: {
        community_id: community.id,
        community_slug: community.slug,
        source_user_id: source.id,
        score: 0.93,
      },
    })
  })
})

// Coarse sweep at SEEK_LIMIT to find the page containing this test's own cluster, bounded by
// MAX_SEEK_PAGES rather than table size.
async function seekOwnedCluster(request: ReturnType<typeof createRequest>, entityId: string) {
  let after: string | undefined
  for (let page = 0; page < MAX_SEEK_PAGES; page += 1) {
    const response = await request
      .get('/api/v1/reports')
      .query({ cluster: 'entity', limit: SEEK_LIMIT, ...(after ? { after } : {}) })
      .expect(200)
    const match = response.body.results.find(
      (row: { entity_id: string }) => row.entity_id === entityId,
    )
    if (match) return match
    if (!response.body.page_info.has_next_page) break
    after = response.body.page_info.end_cursor ?? undefined
  }
  throw new Error(
    `seek exceeded ${MAX_SEEK_PAGES} pages without finding owned cluster for entity ${entityId}`,
  )
}
