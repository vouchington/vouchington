import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { acquireReportPaginationTestLock } from '@voucha/test-helpers/report-pagination-lock'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestModerationReport,
  insertTestPost,
  reviewPendingTestModerationReportsByPostSlugPrefixes as reviewReportsByPostSlugPrefixes,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

// The shared staff report queue is dirty and parallel: other tests leave pending reports behind
// and never clean up (see backend/test-helpers/CLAUDE.md). This traversal only asserts properties
// scoped to the two reports it owns, tolerating that foreign noise instead of requiring a quiet
// table.
const SEEK_LIMIT = 100
const MAX_SEEK_PAGES = 200
const FINE_PAGE_SLACK = 10
const FINE_LIMIT = 1

type ReportRow = Record<string, unknown> & { id: string }
type ListResponse = {
  body: { results: ReportRow[]; page_info: { end_cursor: string | null; has_next_page: boolean } }
}

describe('GET /api/v1/reports cursor tie-break on identical created_at', () => {
  let releaseLock: () => Promise<void>
  let user: PrivateUser
  let adminUser: PrivateUser

  beforeAll(async () => {
    const lock = await acquireReportPaginationTestLock()
    releaseLock = () => lock.release()
    user = await createTestUser()
    adminUser = await createTestUser({ administrator: true })
  })
  afterAll(() => releaseLock())

  it('does not skip reports with the same created_at timestamp across pages', async () => {
    const sameCreatedAt = new Date(
      Date.UTC(2000, 0, 1, 0, 0, 0, crypto.getRandomValues(new Uint16Array(1))[0]),
    )
    await reviewReportsByPostSlugPrefixes(['report-same-created-at-'])
    const firstReporter = await createTestUser()
    const secondReporter = await createTestUser()
    const firstPostId = await insertTestPost({
      createdById: user.id,
      slug: `report-same-created-at-1-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Report Same Created At 1',
      markdown: 'body',
    })
    const secondPostId = await insertTestPost({
      createdById: user.id,
      slug: `report-same-created-at-2-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Report Same Created At 2',
      markdown: 'body',
    })

    const reportIds = await Promise.all([
      insertTestModerationReport({
        reporterUserId: firstReporter.id,
        entityType: 'post',
        entityId: firstPostId,
        reason: 'spam',
        createdAt: sameCreatedAt,
      }),
      insertTestModerationReport({
        reporterUserId: secondReporter.id,
        entityType: 'post',
        entityId: secondPostId,
        reason: 'spam',
        createdAt: sameCreatedAt,
      }),
    ])
    const ownedIds = new Set(reportIds)

    const adminRequest = createRequest()
    await adminRequest.authenticateAs(adminUser)

    // Coarse seek at SEEK_LIMIT to skip past foreign rows cheaply, landing on the cursor just
    // before the page containing one of the two tied-timestamp reports.
    const isOwnedRow = (row: ReportRow) => ownedIds.has(row.id)
    let seekAfter: string | undefined
    let resumeAfter: string | undefined
    let found = false
    for (let page = 0; page < MAX_SEEK_PAGES; page += 1) {
      const response: ListResponse = await adminRequest
        .get('/api/v1/reports')
        .query({
          limit: SEEK_LIMIT,
          sort: 'created_at_asc',
          ...(seekAfter ? { after: seekAfter } : {}),
        })
        .expect(200)
      if (response.body.results.some(isOwnedRow)) {
        found = true
        break
      }
      if (!response.body.page_info.has_next_page) break
      resumeAfter = response.body.page_info.end_cursor ?? undefined
      seekAfter = resumeAfter
    }
    if (!found) throw new Error('seek exhausted results without finding either tied report')

    // Fine traversal at limit=1 — the shape this test actually cares about — walking one row at
    // a time across the same-timestamp pair. Duplicates in `seen` and any leaked
    // `cursor_created_at` are asserted once after the loop rather than per-iteration, so the
    // cursor's id tie-break can neither skip nor repeat either report without expect running
    // conditionally.
    const seen: string[] = []
    const cursorCreatedAtLeaks: unknown[] = []
    let fineAfter = resumeAfter
    const maxFinePages = Math.ceil(SEEK_LIMIT / FINE_LIMIT) + ownedIds.size + FINE_PAGE_SLACK
    for (let page = 0; page < maxFinePages && seen.length < ownedIds.size; page += 1) {
      const response: ListResponse = await adminRequest
        .get('/api/v1/reports')
        .query({
          limit: FINE_LIMIT,
          sort: 'created_at_asc',
          ...(fineAfter ? { after: fineAfter } : {}),
        })
        .expect(200)
      const row = response.body.results[0]
      if (row && isOwnedRow(row)) {
        seen.push(row.id)
        if (row.cursor_created_at !== undefined) cursorCreatedAtLeaks.push(row.cursor_created_at)
      }
      if (!response.body.page_info.has_next_page) break
      fineAfter = response.body.page_info.end_cursor ?? undefined
    }

    if (seen.length !== ownedIds.size) {
      throw new Error(
        `traversal exceeded ${maxFinePages} pages before seeing both tied-timestamp reports`,
      )
    }
    expect(new Set(seen).size).toBe(seen.length)
    expect(cursorCreatedAtLeaks).toEqual([])
    expect(new Set(seen)).toEqual(ownedIds)
  })
})
