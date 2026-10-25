import { beginTransaction, createTestPost, createTestTopic } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import {
  reconcileTestPublicationUntilSnapshotsComplete,
  testUuidPredecessor,
} from '@voucha/test-helpers/post-publication-fixtures'
import { claimPostPublicationDirtyWork } from './dirty-work.mts'
import { recordPostPublicationChange } from './capture.mts'
import { retainPostPublicationKeys } from './retained-key-writes.mts'
import { listPostPublicationIdentityKeys } from './identity-keys.mts'

describe('locked publication terminal page', () => {
  it('retains topic and historical identity effects when the final selected page exactly fills its limit', async () => {
    const post = await createTestPost()
    const topic = await createTestTopic()
    const priorSlug = `prior-${post.id}`
    await using query = await beginTransaction()
    const work = await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: post.id },
      reason: 'post_updated',
      impactedTopicIds: [topic.id],
    })
    await retainPostPublicationKeys(query, work.id, [
      { kind: 'identity_post_slug', textValue: priorSlug },
    ])
    await query.commit()
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected publication work lease')
    const retained = await listPostPublicationIdentityKeys(claimed, 100)
    const slugKey = retained.identityKeys.find(
      key => key.kind === 'post_slug' && key.value === priorSlug,
    )
    if (!slugKey) throw new Error('Expected retained prior slug')
    const result = await reconcileTestPublicationUntilSnapshotsComplete(
      { ...claimed, cursor_key_id: testUuidPredecessor(slugKey.id) },
      1,
      { postIds: [post.id], hasMore: false },
    )
    expect(result.posts.map(row => row.id)).toEqual([post.id])
    expect(result.hasMorePosts).toBe(false)
    expect(result.topicIds).toContain(topic.id)
    expect(result.identityKeys).toContainEqual({
      id: slugKey.id,
      kind: 'post_slug',
      value: priorSlug,
    })
    expect(result.sitemapTargets).toContainEqual({
      postType: post.post_type,
      day: post.created_at.toISOString().slice(0, 10),
    })
  })
})
