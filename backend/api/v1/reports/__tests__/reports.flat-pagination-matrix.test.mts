import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestExpiryWindow,
  createTestUser,
  insertTestModerationReport,
  insertTestPost,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import {
  buildReportPageInfo,
  encodeReportCursor,
  type ModerationReportSort,
} from '@services/moderation-reports'
import { reportCursorScope } from '../reports-cursor.mts'

const FLAT_SORTS: ModerationReportSort[] = [
  'created_at_asc',
  'created_at_desc',
  'most_reported',
  'severity',
]

type ReportRow = { id: string }

type PageInfo = {
  has_next_page: boolean
  has_previous_page: boolean
  start_cursor: string | null
  end_cursor: string | null
}

type TraversalResponse = {
  body: { results: ReportRow[]; page_info: PageInfo }
}

// The shared staff report queue is dirty and parallel: other tests leave pending reports behind
// and never clean up (see backend/test-helpers/CLAUDE.md). These traversals only assert
// properties scoped to the reports this file owns, so they tolerate that foreign noise instead
// of requiring a quiet table. Mutable sorts (`severity`, `most_reported`) 422 when a cursor
// row's report count or judgement rank changes, so this file starts from an owned-report cursor
// rather than seeking through foreign pages of the shared queue.
const FINE_PAGE_SLACK = 25

describe('GET /api/v1/reports flat pagination matrix', () => {
  let admin: PrivateUser
  let reportIds: string[]
  let ownedIds: Set<string>
  const createdAt = createTestExpiryWindow().firstEligibleDate

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    const owner = await createTestUser()
    reportIds = []
    for (let index = 0; index < 6; index += 1) {
      const reporter = await createTestUser()
      const postId = await insertTestPost({
        createdById: owner.id,
        slug: `flat-pagination-matrix-${index}-${crypto.randomUUID().slice(0, 8)}`,
        title: `Flat pagination matrix ${index}`,
        markdown: 'body',
      })
      reportIds.push(
        await insertTestModerationReport({
          reporterUserId: reporter.id,
          entityType: 'post',
          entityId: postId,
          reason: 'spam',
          createdAt: new Date(createdAt.getTime() + index),
        }),
      )
    }
    ownedIds = new Set(reportIds)
  })

  // Each sort does two fine-grained (limit 2 and 4) forward/backward traversals from an
  // owned-report cursor. That's slower than the default 30s under concurrent DB load now that
  // this file runs alongside every other report test instead of behind an exclusive lock; the
  // longer budget accommodates real work, not a hang — each traversal still fails fast with an
  // explicit bounded-page error well before this elapses.
  it.each(FLAT_SORTS)(
    'traverses every owned report exactly once for %s',
    async sort => {
      const firstId = firstOwnedId(sort)
      const resumeAfter = encodeOwnedCursor(firstId, sort)

      for (const limit of [2, 4]) {
        const forward = await traverseOwned(sort, limit, resumeAfter, firstId)
        expect(forward.seen).toHaveLength(ownedIds.size)
        expect(new Set(forward.seen)).toEqual(ownedIds)

        const target = forward.seen.length - forward.lastPageOwnedCount
        const backward = await traverseOwnedBackward(
          sort,
          limit,
          forward.lastPage.start_cursor!,
          target,
          forward.pagesUsed + FINE_PAGE_SLACK,
        )
        expect(backward).toEqual(forward.seen.slice(0, target))
      }
    },
    60_000,
  )

  it('returns canonical empty page info', () => {
    expect(
      buildReportPageInfo([], false, false, {
        sort: 'created_at_desc',
        status: 'pending',
        scope: 'staff',
      }),
    ).toEqual({
      has_next_page: false,
      has_previous_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })

  it('rejects a cursor when status, sort, or cluster scope changes', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const first = await request.get('/api/v1/reports?limit=2&sort=severity').expect(200)
    const after = first.body.page_info.end_cursor as string

    await request
      .get('/api/v1/reports')
      .query({ after, limit: 2, sort: 'severity', status: 'reviewed' })
      .expect(422)
    await request
      .get('/api/v1/reports')
      .query({ after, limit: 2, sort: 'most_reported' })
      .expect(422)
    await request.get('/api/v1/reports').query({ after, limit: 2, cluster: 'entity' }).expect(422)
  })

  it.each([
    '/api/v1/reports?before=',
    '/api/v1/reports?before=first&before=second',
    '/api/v1/reports?after=&before=',
  ])('rejects ambiguous or invalid cursor query shape: %s', async path => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get(path).expect(422)
  })

  // Declared once (not inline in a loop) so no-loop-func can't flag it as a closure re-created
  // per iteration — ownedIds is a describe-scoped `let` set once in beforeAll.
  function isOwnedRow(row: ReportRow): boolean {
    return ownedIds.has(row.id)
  }

  // These fixtures share a randomized per-run future timestamp range and rank 0 / report_count 1,
  // so severity and most_reported match created_at_asc (id ASC) without prior focused runs
  // interleaving rows inside the owned cluster. created_at_desc starts from the newest owned id.
  function firstOwnedId(sort: ModerationReportSort): string {
    return sort === 'created_at_desc'
      ? reportIds.reduce((max, id) => (id > max ? id : max))
      : reportIds.reduce((min, id) => (id < min ? id : min))
  }

  function encodeOwnedCursor(id: string, sort: ModerationReportSort): string {
    return encodeReportCursor(
      { id, cursor_report_count: 1, cursor_severity_rank: 0 },
      { sort, status: 'pending', scope: reportCursorScope('staff', null) },
    )
  }

  // The measured traversal at the limit under test. Stops once every owned report has been
  // seen rather than walking to the true end of the shared queue.
  async function traverseOwned(
    sort: ModerationReportSort,
    limit: number,
    resumeAfter: string,
    leadingId: string,
  ) {
    const request = createRequest()
    await request.authenticateAs(admin)
    const seen: string[] = [leadingId]
    const seenSet = new Set<string>(seen)
    let after: string | undefined = resumeAfter
    let lastPage: PageInfo | undefined
    let lastPageOwnedCount = 0
    const maxPages = ownedIds.size + FINE_PAGE_SLACK
    let pagesUsed = 0
    for (let page = 0; page < maxPages; page += 1) {
      const response: TraversalResponse = await request
        .get('/api/v1/reports')
        .query({ limit, sort, ...(after ? { after } : {}) })
        .expect(200)
      expect(response.body.results).toHaveLength(
        response.body.page_info.has_next_page ? limit : response.body.results.length,
      )
      lastPageOwnedCount = 0
      for (const row of response.body.results) {
        if (!isOwnedRow(row)) continue
        expect(seenSet.has(row.id)).toBe(false)
        seenSet.add(row.id)
        seen.push(row.id)
        lastPageOwnedCount += 1
      }
      lastPage = response.body.page_info
      after = response.body.page_info.end_cursor ?? undefined
      pagesUsed = page + 1
      if (seenSet.size === ownedIds.size) break
      if (!after)
        throw new Error(`traversal for ${sort} ran out of pages before seeing every owned report`)
    }
    if (seenSet.size !== ownedIds.size) {
      throw new Error(
        `traversal for ${sort} exceeded ${maxPages} pages before seeing every owned report`,
      )
    }
    return { seen, lastPage: lastPage!, lastPageOwnedCount, pagesUsed }
  }

  // Walks backward from the start of the final forward page, so it only needs to cover the
  // owned reports that page excluded (`target`), not the whole table. `maxPages` is bounded by
  // the caller to the forward pass's own page count — backward covers a strict subset of the same
  // row range, so it can never legitimately need more pages than forward did.
  async function traverseOwnedBackward(
    sort: ModerationReportSort,
    limit: number,
    before: string,
    target: number,
    maxPages: number,
  ) {
    const request = createRequest()
    await request.authenticateAs(admin)
    const seen: string[] = []
    const seenSet = new Set<string>()
    let cursor: string | undefined = before
    for (let page = 0; page < maxPages && seenSet.size < target; page += 1) {
      const response: TraversalResponse = await request
        .get('/api/v1/reports')
        .query({ limit, sort, before: cursor })
        .expect(200)
      const owned = response.body.results.filter(isOwnedRow)
      for (const row of owned) seenSet.add(row.id)
      seen.unshift(...owned.map(row => row.id))
      cursor = response.body.page_info.has_previous_page
        ? (response.body.page_info.start_cursor ?? undefined)
        : undefined
      if (!cursor) break
    }
    if (seenSet.size !== target) {
      throw new Error(
        `backward traversal for ${sort} found ${seenSet.size} owned reports before the final page, expected ${target}`,
      )
    }
    return seen
  }
})
