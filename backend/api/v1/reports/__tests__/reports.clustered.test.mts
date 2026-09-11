import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { acquireReportPaginationTestLock } from '@voucha/test-helpers/report-pagination-lock'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  addDummyEmbeddingToPost,
  createTestUser,
  getTestModerationReportCaseId,
  insertTestModerationReport,
  insertTestPost,
  makeRandomEmbedding,
  makeNearbyEmbedding,
  setPostModerationContentSha256,
  setPostSpamDetectionResults,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { ModerationReportReason } from '@services/moderation-reports/config'
import { createVoteIntegrityFlag } from '@services/vote-integrity/create-flag'
import { encodeTestCursor } from '@voucha/test-helpers/api/reports-clustered-helpers'

describe('GET /api/v1/reports?cluster=entity', () => {
  let releaseLock: () => Promise<void>
  beforeAll(async () => {
    const lock = await acquireReportPaginationTestLock()
    releaseLock = () => lock.release()
  })
  let user: PrivateUser
  let adminUser: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    adminUser = await createTestUser({ administrator: true })
  })
  afterAll(() => releaseLock())

  it('clusters staff reports by reported entity', async () => {
    const owner = await createTestUser()
    const postId = await insertPostWithUniqueModerationHash(owner.id, 'cluster-entity')
    const reporters = await Promise.all([createTestUser(), createTestUser(), createTestUser()])
    const reportIds = await Promise.all([
      insertTestModerationReport({
        reporterUserId: reporters[0]!.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        note: 'Copied post',
        createdAt: new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 996)),
      }),
      insertTestModerationReport({
        reporterUserId: reporters[1]!.id,
        entityType: 'post',
        entityId: postId,
        reason: 'spam',
        createdAt: new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 996)),
      }),
      insertTestModerationReport({
        reporterUserId: reporters[2]!.id,
        entityType: 'post',
        entityId: postId,
        reason: 'harassment',
        createdAt: new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 996)),
      }),
    ])
    const caseIds = await Promise.all(reportIds.map(getTestModerationReportCaseId))

    const request = createRequest()
    await request.authenticateAs(adminUser)
    const response = await request.get('/api/v1/reports?cluster=entity&limit=1000').expect(200)

    expect(response.body.cluster_mode).toBe('entity')
    const cluster = response.body.results.find(
      (item: { entity_id: string }) => item.entity_id === postId,
    )
    expect(cluster).toMatchObject({
      entity_type: 'post',
      entity_id: postId,
      report_count: 3,
      reporter_count: 3,
    })
    expect(cluster.reason_breakdown).toEqual(
      expect.arrayContaining([
        { reason: 'spam', count: 2 },
        { reason: 'harassment', count: 1 },
      ]),
    )
    expect(cluster.reports.map((report: { id: string }) => report.id).sort()).toEqual(
      reportIds.toSorted(),
    )
    expect(cluster.reports.map((report: { case_id: string }) => report.case_id).toSorted()).toEqual(
      caseIds.toSorted(),
    )
    expect(
      cluster.reports.every((report: { report_count: number }) => report.report_count === 3),
    ).toBe(true)
  })

  it('rejects clustered report mode for non-staff users', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get('/api/v1/reports?cluster=entity').expect(403)
  })

  it('surfaces content-hash duplicate clusters and velocity-spike indicators', async () => {
    const sharedHash = randomSha256()
    const owner = await createTestUser()
    const postIds = await Promise.all(
      [0, 1, 2].map(async index => {
        const postId = await insertTestPost({
          createdById: owner.id,
          slug: `hash-cluster-${index}-${crypto.randomUUID().slice(0, 8)}`,
          title: `Hash Cluster ${index}`,
          markdown: 'same hash body',
        })
        await setPostModerationContentSha256(postId, sharedHash)
        await setPostSpamDetectionResults(postId, [
          { signal: 'content_hash_duplicate', score: 1, flagged: true },
        ])
        return postId
      }),
    )
    await createVoteIntegrityFlag('post', postIds[0]!, 'velocity_spike', { test: true })
    await createReportsForPosts(postIds, 'spam', new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 997)))

    const request = createRequest()
    await request.authenticateAs(adminUser)
    const response = await request.get('/api/v1/reports?cluster=entity&limit=1000').expect(200)

    const expectedDuplicateId = `content-hash:${sharedHash.toString('hex')}`
    const duplicate = response.body.duplicate_clusters.find(
      (item: { id: string }) => item.id === expectedDuplicateId,
    )
    expect(duplicate).toMatchObject({ post_count: 3, report_count: 3 })
    expect(
      new Set(duplicate.clusters.map((cluster: { entity_id: string }) => cluster.entity_id)),
    ).toEqual(new Set(postIds))
    const flaggedCluster = response.body.results.find(
      (cluster: { entity_id: string }) => cluster.entity_id === postIds[0],
    )
    expect(flaggedCluster.indicators).toMatchObject({
      content_hash_duplicate: true,
      velocity_spike: true,
    })
  })

  it('surfaces stored-embedding duplicate clusters without rerunning detection', async () => {
    const owner = await createTestUser()
    const embedding = makeRandomEmbedding()
    const postIds = await Promise.all(
      [0, 1, 2].map(async index => {
        const postId = await insertPostWithUniqueModerationHash(owner.id, `embedding-${index}`)
        await addDummyEmbeddingToPost(postId, { embedding: makeNearbyEmbedding(embedding, 0.01) })
        await setPostSpamDetectionResults(postId, [
          { signal: 'embeddings_similarity', score: 1, flagged: true },
        ])
        return postId
      }),
    )
    await createReportsForPosts(postIds, 'spam', new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 998)))

    const request = createRequest()
    await request.authenticateAs(adminUser)
    const response = await request.get('/api/v1/reports?cluster=entity&limit=1000').expect(200)

    const duplicate = response.body.duplicate_clusters.find(
      (item: { signal: string }) => item.signal === 'embeddings_similarity',
    )
    expect(duplicate).toMatchObject({ post_count: 3, report_count: 3 })
    expect(
      new Set(duplicate.clusters.map((cluster: { entity_id: string }) => cluster.entity_id)),
    ).toEqual(new Set(postIds))
  })

  it('paginates clustered reports with entity-type cursors', async () => {
    const owner = await createTestUser()
    const postIds = await Promise.all(
      [0, 1, 2].map(index =>
        insertPostWithUniqueModerationHash(owner.id, `cluster-cursor-${index}`),
      ),
    )
    await createReportsForPosts(postIds, 'spam', new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 995)))

    const request = createRequest()
    await request.authenticateAs(adminUser)
    const first = await request.get('/api/v1/reports?cluster=entity&limit=1').expect(200)
    const cursor = first.body.page_info.end_cursor
    expect(cursor).toEqual(expect.any(String))
    expect(first.body.page_info.start_cursor).toEqual(expect.any(String))

    const next = await request
      .get(`/api/v1/reports?cluster=entity&limit=1&after=${encodeURIComponent(cursor)}`)
      .expect(200)
    expect(next.body.results).toHaveLength(1)
    expect(next.body.results[0].entity_id).not.toBe(first.body.results[0].entity_id)

    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<
      string,
      string
    >
    expect(decoded.sort).toBe('created_at_desc')
    delete decoded.entity_type
    delete decoded.sort
    const legacyCursor = encodeTestCursor(decoded)
    await request
      .get(`/api/v1/reports?cluster=entity&limit=1&after=${encodeURIComponent(legacyCursor)}`)
      .expect(422)

    const invalidEntityCursor = encodeTestCursor({ ...decoded, entity_type: 'not_reportable' })
    await request
      .get(
        `/api/v1/reports?cluster=entity&limit=1&after=${encodeURIComponent(invalidEntityCursor)}`,
      )
      .expect(422)

    const invalidDateCursor = encodeTestCursor({
      ...decoded,
      created_at: '2026-02-31T00:00:00.000000Z',
      entity_type: 'post',
      sort: 'created_at_desc',
    })
    await request
      .get(`/api/v1/reports?cluster=entity&after=${encodeURIComponent(invalidDateCursor)}`)
      .expect(422)

    const sortFlippedCursor = encodeTestCursor({
      ...decoded,
      entity_type: 'post',
      sort: 'created_at_asc',
    })
    await request
      .get(`/api/v1/reports?cluster=entity&limit=1&after=${encodeURIComponent(sortFlippedCursor)}`)
      .expect(422)
  })
})

async function insertPostWithUniqueModerationHash(ownerId: string, slugPrefix: string) {
  const postId = await insertTestPost({
    createdById: ownerId,
    slug: `${slugPrefix}-${crypto.randomUUID().slice(0, 8)}`,
    title: `${slugPrefix} ${crypto.randomUUID().slice(0, 8)}`,
    markdown: 'body',
  })
  await setPostModerationContentSha256(postId, randomSha256())
  return postId
}

async function createReportsForPosts(
  postIds: string[],
  reason: ModerationReportReason,
  createdAt?: Date,
) {
  const reportIds: string[] = []
  for (const postId of postIds) {
    const reporter = await createTestUser()
    reportIds.push(
      await insertTestModerationReport({
        reporterUserId: reporter.id,
        entityType: 'post',
        entityId: postId,
        reason,
        createdAt,
      }),
    )
  }
  return reportIds
}

function randomSha256(): Buffer {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32)))
}
