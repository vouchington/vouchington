import { beginTransaction } from '@data-stores/psql'
import { recordStoryTopicPublicationChanges } from './capture-story-topics.mts'
import { createTestPost, createTestUser } from '@voucha/test-helpers'
import { recordPostPublicationChange } from './capture.mts'
import { claimPostPublicationDirtyWork } from './dirty-work.mts'
import { listPublicationCandidates } from './publication-candidates.mts'
import { reconcilePostPublicationDirtyWork, type ReconciliationPost } from './reconcile.mts'
import type { ClaimedPostPublicationDirtyWork } from './types.mts'
import type { PublicationProjectionIdentity } from './projection-identity.mts'
import { readTestPublicationSnapshot } from '@voucha/test-helpers/entities/post-publication-snapshots'

export async function reconcileTestPublicationUntilSnapshotsComplete(
  work: ClaimedPostPublicationDirtyWork,
  limit?: number,
  selectedPostIds?: readonly string[],
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- retries consume durable sequential snapshot cursors.
    const result = await reconcilePostPublicationDirtyWork(work, limit, selectedPostIds)
    if (!result.hasIncompleteSnapshots) return result
  }
  throw new Error('Test publication snapshot did not converge')
}

export async function getTestPublicationProjectionIdentity(
  post: ReconciliationPost,
): Promise<PublicationProjectionIdentity> {
  if (!post.identity_snapshot_id) throw new Error('Expected completed publication snapshot')
  const snapshot = await readTestPublicationSnapshot(post.identity_snapshot_id)
  return {
    topicIds: snapshot.keys.flatMap(key => (key.kind === 'topic' ? [key.value] : [])),
    identityKeys: snapshot.keys.flatMap(key =>
      key.kind !== 'topic' && key.kind !== 'sitemap_target'
        ? [
            {
              kind: key.kind === 'author_username' ? 'author' : key.kind,
              value: key.value,
            },
          ]
        : [],
    ),
    sitemapTargets: snapshot.keys.flatMap(key => {
      if (key.kind !== 'sitemap_target') return []
      const [postType, day] = key.value.split(':')
      return [{ postType: postType!, day: day! }]
    }),
  }
}

export async function createTestPublicationSnapshotWork() {
  const user = await createTestUser()
  if (!user) throw new Error('Expected snapshot user')
  const post = await createTestPost({ user })
  await using query = await beginTransaction()
  const pending = await recordPostPublicationChange(query, {
    scope: { type: 'post', postId: post.id },
    reason: 'post_updated',
  })
  await query.commit()
  const work = await claimPostPublicationDirtyWork(pending, 120)
  if (!work) throw new Error('Expected snapshot work')
  const [candidate] = await listPublicationCandidates(work, 1, [post.id])
  if (!candidate) throw new Error('Expected snapshot candidate')
  return { work, candidate, user }
}

export async function recordTestStoryTopicPublicationChange(options: {
  storyId: string
  impactedPostIds: readonly string[]
  impactedTopicIds: readonly string[]
}): Promise<void> {
  await using query = await beginTransaction()
  await recordStoryTopicPublicationChanges(query, [options])
  await query.commit()
}
