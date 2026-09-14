import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestModerationReport, insertTestPost } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

type ClusteredSort = 'created_at_asc' | 'created_at_desc'

type ClusterRow = { id: string; first_reported_at: string; last_reported_at: string }

type PageInfo = {
  has_next_page: boolean
  has_previous_page: boolean
  start_cursor: string | null
  end_cursor: string | null
}

type TraversalResponse = {
  body: { results: ClusterRow[]; page_info: PageInfo }
}

// The shared staff report queue is dirty and parallel: other tests leave pending reports behind
// and never clean up (see backend/test-helpers/CLAUDE.md). These traversals only assert
// properties scoped to the clusters this file owns, so they tolerate that foreign noise instead
// of requiring a quiet table.
const SEEK_LIMIT = 100
const MAX_SEEK_PAGES = 200
const FINE_PAGE_SLACK = 25

describe('GET /api/v1/reports clustered pagination matrix', () => {
  let admin: PrivateUser
  let clusterIds: string[]
  let ownedIds: Set<string>
  const createdAt = new Date(Date.UTC(9998, 0, 1, 0, 0, 0, 989))
  const laterCreatedAt = new Date(Date.UTC(9998, 0, 2, 0, 0, 0, 989))

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    const owner = await createTestUser()
    clusterIds = []
    for (let index = 0; index < 6; index += 1) {
      const reporter = await createTestUser()
      const postId = await insertTestPost({
        createdById: owner.id,
        slug: `cluster-pagination-matrix-${index}-${crypto.randomUUID().slice(0, 8)}`,
        title: `Cluster pagination matrix ${index}`,
        markdown: 'body',
      })
      clusterIds.push(`post:${postId}`)
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        createdAt,
      })
      const laterReporter = await createTestUser()
      await insertTestModerationReport({
        reporterUserId: laterReporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'harassment',
        createdAt: laterCreatedAt,
      })
    }
    ownedIds = new Set(clusterIds)
  })

  // Each sort does a coarse seek plus two fine-grained (limit 2 and 4) forward/backward
  // traversals — dozens of real HTTP+DB round trips by design (see the bounded seek-then-find
  // rationale above the constants). That's legitimately slower than the project's default 30s
  // under concurrent DB load now that this file runs alongside every other report test instead
  // of behind an exclusive lock; the longer budget accommodates real work, not a hang — each
  // traversal still fails fast with an explicit bounded-page error well before this elapses.
  it.each(['created_at_asc', 'created_at_desc'] as const)(
    'traverses every owned cluster exactly once for %s',
    async sort => {
      const resumeAfter = await seekCursorBeforeOwnedRows(sort)

      for (const limit of [2, 4]) {
        const forward = await traverseOwned(sort, limit, resumeAfter)
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

  it('rejects a cursor when status, sort, cluster mode, or audience scope changes', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const first = await request
      .get('/api/v1/reports?cluster=entity&limit=2&sort=created_at_desc')
      .expect(200)
    const after = first.body.page_info.end_cursor as string

    await request
      .get('/api/v1/reports')
      .query({ after, cluster: 'entity', status: 'reviewed' })
      .expect(422)
    await request
      .get('/api/v1/reports')
      .query({ after, cluster: 'entity', sort: 'created_at_asc' })
      .expect(422)
    await request.get('/api/v1/reports').query({ after, sort: 'created_at_desc' }).expect(422)

    const decoded = JSON.parse(Buffer.from(after, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
    decoded.scope = JSON.stringify({ audience: 'member', ownerId: crypto.randomUUID() })
    const wrongScope = Buffer.from(JSON.stringify(decoded)).toString('base64url')
    await request.get('/api/v1/reports').query({ after: wrongScope, cluster: 'entity' }).expect(422)
  })

  // Declared once (not inline in a loop) so no-loop-func can't flag it as a closure re-created
  // per iteration — ownedIds is a describe-scoped `let` set once in beforeAll.
  function isOwnedRow(row: ClusterRow): boolean {
    return ownedIds.has(row.id)
  }

  // Coarse sweep at the endpoint's max page size, skipping foreign clusters until a page
  // contains one this file owns. Bounded by MAX_SEEK_PAGES rather than by table size, so it
  // stays cheap regardless of how large the shared backlog is.
  async function seekCursorBeforeOwnedRows(sort: ClusteredSort): Promise<string | undefined> {
    const request = createRequest()
    await request.authenticateAs(admin)
    let after: string | undefined
    let resumeAfter: string | undefined
    for (let page = 0; page < MAX_SEEK_PAGES; page += 1) {
      const response: TraversalResponse = await request
        .get('/api/v1/reports')
        .query({ cluster: 'entity', limit: SEEK_LIMIT, sort, ...(after ? { after } : {}) })
        .expect(200)
      if (response.body.results.some(isOwnedRow)) return resumeAfter
      if (!response.body.page_info.has_next_page) {
        throw new Error(`seek for ${sort} exhausted results without finding any owned cluster`)
      }
      resumeAfter = response.body.page_info.end_cursor ?? undefined
      after = resumeAfter
    }
    throw new Error(
      `seek for ${sort} exceeded ${MAX_SEEK_PAGES} pages of ${SEEK_LIMIT} without finding an owned cluster`,
    )
  }

  // The measured traversal at the limit under test. Stops once every owned cluster has been
  // seen rather than walking to the true end of the shared queue.
  async function traverseOwned(
    sort: ClusteredSort,
    limit: number,
    resumeAfter: string | undefined,
  ) {
    const request = createRequest()
    await request.authenticateAs(admin)
    const seen: string[] = []
    const seenSet = new Set<string>()
    let after = resumeAfter
    let lastPage: PageInfo | undefined
    let lastPageOwnedCount = 0
    // seekCursorBeforeOwnedRows only guarantees an owned cluster is SOMEWHERE within the
    // SEEK_LIMIT-sized page it matched on, not that it's near the start — the fine pass must be
    // able to cross that whole window at the (smaller) limit under test, not just clear
    // ownedIds.size pages of it.
    const maxPages = Math.ceil(SEEK_LIMIT / limit) + ownedIds.size + FINE_PAGE_SLACK
    let pagesUsed = 0
    for (let page = 0; page < maxPages; page += 1) {
      const response: TraversalResponse = await request
        .get('/api/v1/reports')
        .query({ cluster: 'entity', limit, sort, ...(after ? { after } : {}) })
        .expect(200)
      expect(response.body.results).toHaveLength(
        response.body.page_info.has_next_page ? limit : response.body.results.length,
      )
      lastPageOwnedCount = 0
      for (const row of response.body.results) {
        if (!isOwnedRow(row)) continue
        expect(seenSet.has(row.id)).toBe(false)
        expect(row.first_reported_at).not.toBe(row.last_reported_at)
        seenSet.add(row.id)
        seen.push(row.id)
        lastPageOwnedCount += 1
      }
      lastPage = response.body.page_info
      after = response.body.page_info.end_cursor ?? undefined
      pagesUsed = page + 1
      if (seenSet.size === ownedIds.size) break
      if (!after)
        throw new Error(`traversal for ${sort} ran out of pages before seeing every owned cluster`)
    }
    if (seenSet.size !== ownedIds.size) {
      throw new Error(
        `traversal for ${sort} exceeded ${maxPages} pages before seeing every owned cluster`,
      )
    }
    return { seen, lastPage: lastPage!, lastPageOwnedCount, pagesUsed }
  }

  // Walks backward from the start of the final forward page, so it only needs to cover the
  // owned clusters that page excluded (`target`), not the whole table. `maxPages` is bounded by
  // the caller to the forward pass's own page count — backward covers a strict subset of the same
  // row range, so it can never legitimately need more pages than forward did.
  async function traverseOwnedBackward(
    sort: ClusteredSort,
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
        .query({ cluster: 'entity', limit, sort, before: cursor })
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
        `backward traversal for ${sort} found ${seenSet.size} owned clusters before the final page, expected ${target}`,
      )
    }
    return seen
  }
})
