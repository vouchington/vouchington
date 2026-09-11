import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { acquireReportPaginationTestLock } from '@voucha/test-helpers/report-pagination-lock'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestModerationReport,
  insertTestPost,
  setPostModerationContentSha256,
  setPostSpamDetectionResults,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/reports clustered page-local sidecars', () => {
  let releaseLock: () => Promise<void>
  beforeAll(async () => {
    const lock = await acquireReportPaginationTestLock()
    releaseLock = () => lock.release()
  })
  let adminUser: PrivateUser

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })
  })
  afterAll(() => releaseLock())

  it('derives sidecars per page with a recurring stable content-hash id', async () => {
    const sharedHash = randomSha256()
    await createDuplicatePostReports(
      6,
      sharedHash,
      new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 999)),
    )

    const request = createRequest()
    await request.authenticateAs(adminUser)
    const first = await request.get('/api/v1/reports?cluster=entity&limit=3').expect(200)
    const second = await request
      .get(
        `/api/v1/reports?cluster=entity&limit=3&after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(JSON.stringify(first.body)).not.toContain('"cursor_')
    expect(JSON.stringify(second.body)).not.toContain('"cursor_')

    const expectedSidecarId = `content-hash:${sharedHash.toString('hex')}`
    const firstSidecar = findSidecar(first.body.duplicate_clusters, expectedSidecarId)
    const secondSidecar = findSidecar(second.body.duplicate_clusters, expectedSidecarId)
    expect(firstSidecar.id).toBe(expectedSidecarId)
    expect(secondSidecar.id).toBe(firstSidecar.id)
    expect(firstSidecar.clusters).toHaveLength(3)
    expect(secondSidecar.clusters).toHaveLength(3)
    expect(
      new Set([
        ...firstSidecar.clusters.map(({ id }) => id),
        ...secondSidecar.clusters.map(({ id }) => id),
      ]),
    ).toHaveLength(6)
  })

  it('does not reconstruct below-threshold sidecars across pages', async () => {
    await createDuplicatePostReports(4, randomSha256(), new Date(Date.UTC(1970, 0, 1, 0, 0, 1)))

    const request = createRequest()
    await request.authenticateAs(adminUser)
    const first = await request
      .get('/api/v1/reports?cluster=entity&limit=2&sort=created_at_asc')
      .expect(200)
    const second = await request
      .get(
        `/api/v1/reports?cluster=entity&limit=2&sort=created_at_asc&after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(first.body.duplicate_clusters).toEqual([])
    expect(second.body.duplicate_clusters).toEqual([])
  })
})

async function createDuplicatePostReports(count: number, hash: Buffer, createdAt: Date) {
  const owner = await createTestUser()
  const postIds = await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const postId = await insertTestPost({
        createdById: owner.id,
        slug: `page-local-duplicate-${index}-${crypto.randomUUID().slice(0, 8)}`,
        title: `Page-local duplicate ${index}`,
        markdown: 'same page-local hash body',
      })
      await setPostModerationContentSha256(postId, hash)
      await setPostSpamDetectionResults(postId, [
        { signal: 'content_hash_duplicate', score: 1, flagged: true },
      ])
      return postId
    }),
  )
  for (const postId of postIds) {
    const reporter = await createTestUser()
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
      createdAt,
    })
  }
}

function findSidecar(sidecars: Array<{ id: string; clusters: Array<{ id: string }> }>, id: string) {
  return sidecars.find(sidecar => sidecar.id === id)!
}

function randomSha256(): Buffer {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32)))
}
