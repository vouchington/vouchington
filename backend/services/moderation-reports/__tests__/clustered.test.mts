import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestModerationReport, insertTestPost } from '@voucha/test-helpers'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { listClusteredModerationReports } from '../clustered.mts'

describe('clustered moderation report enrichment failures', () => {
  it('keeps owned reports visible with empty indicators when the indicator query fails', async () => {
    const { owned, list } = await createOwnedReports()
    const { result, error } = await withPostgresPoolQueryFailureForTest(
      '/* listClusteredModerationReports:postIndicators */',
      list,
    )

    expect(sentryCaptureExceptionMock.mock.calls.some(([captured]) => captured === error)).toBe(
      true,
    )
    for (const { postId, reportId } of owned) {
      expect(result.results.find(row => row.entity_id === postId)).toMatchObject({
        entity_type: 'post',
        reports: expect.arrayContaining([expect.objectContaining({ id: reportId })]),
        indicators: {
          content_hash_duplicate: false,
          embeddings_similarity: false,
          velocity_spike: false,
        },
      })
    }
  })

  it('keeps owned reports visible without duplicate clusters when the embedding query fails', async () => {
    const { owned, list } = await createOwnedReports()
    const { result, error } = await withPostgresPoolQueryFailureForTest(
      '/* listClusteredModerationReports:embeddingPairs */',
      list,
    )

    expect(sentryCaptureExceptionMock.mock.calls.some(([captured]) => captured === error)).toBe(
      true,
    )
    expect(result.duplicate_clusters).toEqual([])
    for (const { postId, reportId } of owned) {
      expect(result.results.find(row => row.entity_id === postId)).toMatchObject({
        entity_type: 'post',
        reports: expect.arrayContaining([expect.objectContaining({ id: reportId })]),
      })
    }
  })
})

async function createOwnedReports() {
  const anchor = new Date()
  const author = await createTestUser()
  const owned = []
  for (let index = 0; index < 3; index += 1) {
    const reporter = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      title: `Cluster enrichment ${randomUUID()}`,
      slug: `cluster-enrichment-${randomUUID()}`,
      markdown: 'Owned moderation target',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      createdAt: new Date(),
    })
    owned.push({ postId, reportId })
  }

  const list = () =>
    listClusteredModerationReports({
      status: 'pending',
      limit: 1000,
      sort: 'created_at_asc',
      cursorScope: randomUUID(),
      beforeCursor: {
        createdAt: anchor.toISOString(),
        id: '00000000-0000-4000-8000-000000000000',
        entityType: 'post',
      },
    })
  return { owned, list }
}
