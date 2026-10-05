import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  deleteTestPost,
  getPostArchivedFields,
  getPostArchiveRevisionsForTest,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'
import { getPostByAny } from '../get.mts'
import { updatePost } from '../update.mts'
import {
  streamEntityReconciliationCandidateBatches,
  type EntityReconciliationCandidate,
} from '@services/entity-listener-reconciliation/reconciliation'
import { reconcileReviewSuccessionsForPostIds } from './index.mts'
import { listReviewSuccessionsForPostIds } from './list.mts'

async function createReviewPair() {
  const administrator = await createTestUser({ administrator: true })
  const topicId = await insertTestTopic({
    name: `Succession revision ${createRandomString(10)}`,
    slug: `succession-revision-${createRandomString(10)}`,
    createdById: administrator.id,
  })
  const postIds: string[] = []
  for (const label of ['predecessor', 'successor']) {
    const suffix = createRandomString(10)
    const postId = await insertTestPost({
      title: `Succession revision ${label} ${suffix}`,
      slug: `succession-revision-${suffix}`,
      createdById: administrator.id,
      markdown: 'Automatic review revision fixture.',
      postType: 'review',
      clearanceStatus: 'approved',
    })
    await insertTestPostReview(postId, topicId)
    postIds.push(postId)
  }
  return { administrator, predecessorId: postIds[0]!, successorId: postIds[1]! }
}

describe('review succession post revisions', () => {
  it('records archive and restore timestamps once and exposes non-content listener events', async () => {
    const { administrator, predecessorId, successorId } = await createReviewPair()
    const windowStart = new Date(Date.now() - 60_000)
    await reconcileReviewSuccessionsForPostIds([successorId])
    const [epoch] = await listReviewSuccessionsForPostIds([predecessorId])
    const archived = await getPostArchiveRevisionsForTest(predecessorId)
    expect(archived).toHaveLength(1)
    expect(archived[0]).toMatchObject({ revision_type: 'update', revised_by_id: null })
    expect(archived[0]!.changes.archived_at!.before).toBeNull()
    expect(new Date(archived[0]!.changes.archived_at!.after as string)).toEqual(
      epoch!.predecessor_archived_at,
    )

    await reconcileReviewSuccessionsForPostIds([successorId])
    expect(await getPostArchiveRevisionsForTest(predecessorId)).toEqual(archived)
    expect(await listReviewSuccessionsForPostIds([predecessorId])).toEqual([epoch])

    await setTestPostClearanceStatus(successorId, 'rejected', administrator.id)
    await reconcileReviewSuccessionsForPostIds([successorId])
    const restored = await getPostArchiveRevisionsForTest(predecessorId)
    expect(restored).toHaveLength(2)
    expect(restored[1]).toMatchObject({ revision_type: 'update', revised_by_id: null })
    expect(new Date(restored[1]!.changes.archived_at!.before as string)).toEqual(
      epoch!.predecessor_archived_at,
    )
    expect(restored[1]!.changes.archived_at!.after).toBeNull()
    expect((await getPostArchivedFields(predecessorId))?.archived_at).toBeNull()
    const ended = await listReviewSuccessionsForPostIds([predecessorId])
    await reconcileReviewSuccessionsForPostIds([successorId])
    expect(await getPostArchiveRevisionsForTest(predecessorId)).toEqual(restored)
    expect(await listReviewSuccessionsForPostIds([predecessorId])).toEqual(ended)

    const revisionIds = new Set(restored.map(revision => revision.id))
    const candidates = []
    const window = { start: windowStart, end: new Date(Date.now() + 60_000) }
    let after: EntityReconciliationCandidate | undefined
    let hasMore = true
    const onComplete = (result: { hasMore: boolean }) => {
      hasMore = result.hasMore
    }
    while (hasMore) {
      hasMore = false
      for await (const batch of streamEntityReconciliationCandidateBatches(window, {
        after,
        onComplete,
      })) {
        after = batch.at(-1)
        candidates.push(...batch.filter(candidate => revisionIds.has(candidate.changeId ?? '')))
      }
    }
    expect(candidates).toHaveLength(2)
    for (const candidate of candidates) {
      expect(candidate).toMatchObject({
        entityType: 'post_updated',
        entityId: predecessorId,
        contentChanged: false,
      })
    }
  })

  it('records an automatic restore when the successor is deleted', async () => {
    const { predecessorId, successorId } = await createReviewPair()
    await reconcileReviewSuccessionsForPostIds([successorId])
    const [epoch] = await listReviewSuccessionsForPostIds([predecessorId])
    await deleteTestPost(successorId)
    await reconcileReviewSuccessionsForPostIds([successorId])
    const revisions = await getPostArchiveRevisionsForTest(predecessorId)
    expect(revisions).toHaveLength(2)
    expect(new Date(revisions[1]!.changes.archived_at!.before as string)).toEqual(
      epoch!.predecessor_archived_at,
    )
    expect(revisions[1]!.changes.archived_at!.after).toBeNull()
  })

  it('keeps a manual override revision separate and writes no automatic restore', async () => {
    const { administrator, predecessorId, successorId } = await createReviewPair()
    await reconcileReviewSuccessionsForPostIds([successorId])
    const post = await getPostByAny(predecessorId)
    if (!post) throw new Error('Expected archived predecessor')
    await setTestPostClearanceStatus(successorId, 'rejected', administrator.id)
    await updatePost(administrator, post, { archive: false })
    const revisions = await getPostArchiveRevisionsForTest(predecessorId)
    expect(revisions).toHaveLength(2)
    expect(revisions[1]).toMatchObject({
      revision_type: 'update',
      revised_by_id: administrator.id,
      changes: { archived_at: { after: null } },
    })
    await reconcileReviewSuccessionsForPostIds([successorId])
    expect(await getPostArchiveRevisionsForTest(predecessorId)).toEqual(revisions)
    expect(await listReviewSuccessionsForPostIds([predecessorId])).toMatchObject([
      { manual_override_at: expect.any(Date), automatically_restored_at: null },
    ])
  })
})
