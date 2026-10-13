import { randomInt } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestModerationReport,
  insertTestPost,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { paginationConfig } from '@services/pagination/config'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'

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

// Owned keyset bounds avoid scanning the dirty staff queue. One non-owned row
// interleaves the five owned rows; all requests still execute the real HTTP/SQL path.
const FINE_PAGE_SLACK = 2

describe('GET /api/v1/reports clustered pagination matrix', () => {
  let restorePagination: (() => void) | undefined
  let admin: PrivateUser
  let clusterIds: string[]
  let ownedIds: Set<string>
  let excludedControlId: string
  // Both report times are injected ordering input; no SQL NOW eligibility is tested.
  const createdAt = new Date(Date.UTC(1971, 0, 1) + randomInt(31_536_000_000))
  const laterCreatedAt = new Date(createdAt.getTime() + 1_000)

  beforeAll(async () => {
    await paginationConfig.waitForInitialization()
    paginationConfig.unsubscribe()
    restorePagination = overrideDynamicConfigFieldsForTest(paginationConfig, {
      default_limit: 2,
      max_limit: 4,
    })
    admin = await createTestUser({ administrator: true })
    const owner = await createTestUser()
    clusterIds = []
    const reporter = await createTestUser()
    const laterReporter = await createTestUser()
    for (let index = 0; index < 6; index += 1) {
      const postId = await insertTestPost({
        createdById: owner.id,
        slug: `cluster-pagination-matrix-${index}-${crypto.randomUUID().slice(0, 8)}`,
        title: `Cluster pagination matrix ${index}`,
        markdown: 'body',
      })
      if (index === 2) excludedControlId = `post:${postId}`
      else clusterIds.push(`post:${postId}`)
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        createdAt: new Date(createdAt.getTime() + index * 10),
      })
      await insertTestModerationReport({
        reporterUserId: laterReporter.id,
        entityType: 'post',
        entityId: postId,
        reason: 'harassment',
        createdAt: new Date(laterCreatedAt.getTime() + index * 10),
      })
    }
    ownedIds = new Set(clusterIds)
  })

  afterAll(async () => {
    restorePagination?.()
    await closeScopedDynamicConfigContext([paginationConfig])
  })

  it.each(['created_at_asc', 'created_at_desc'] as const)(
    'traverses every owned cluster exactly once for %s',
    async sort => {
      const resumeAfter = encodeOwnedBoundary(sort)

      for (const limit of [2, 4]) {
        const forward = await traverseOwned(sort, limit, resumeAfter)
        expect(forward.seen).toHaveLength(ownedIds.size)
        expect(new Set(forward.seen)).toEqual(ownedIds)
        expect(forward.excludedControlSeen).toBe(true)

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
  )

  it('rejects a cursor when status, sort, cluster mode, or audience scope changes', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const first = await request
      .get('/api/v1/reports')
      .query({
        cluster: 'entity',
        limit: 2,
        sort: 'created_at_desc',
        after: encodeOwnedBoundary('created_at_desc'),
      })
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

  // Cluster cursors are tuple watermarks; the public parser does not require a cursor row.
  // Bound the namespace immediately before its owned range in the chosen SQL direction.
  function encodeOwnedBoundary(sort: ClusteredSort): string {
    const ascending = sort === 'created_at_asc'
    return Buffer.from(
      JSON.stringify({
        cluster: true,
        created_at: new Date(
          (ascending ? createdAt : laterCreatedAt).getTime() + (ascending ? -1 : 60),
        )
          .toISOString()
          .replace('Z', '000Z'),
        entity_type: 'post',
        id: clusterIds[0]!.slice('post:'.length),
        sort,
        status: 'pending',
        scope: JSON.stringify({ audience: 'staff', ownerId: null }),
      }),
    ).toString('base64url')
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
    const maxPages = ownedIds.size + FINE_PAGE_SLACK
    let excludedControlSeen = false
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
        if (row.id === excludedControlId) excludedControlSeen = true
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
    return { seen, lastPage: lastPage!, lastPageOwnedCount, pagesUsed, excludedControlSeen }
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
