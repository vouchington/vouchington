import { beginTransaction, write } from '@data-stores/psql'
import { recordStoryTopicPublicationChanges } from '../services/post-publication/capture-story-topics.mts'
import { createTestPost, createTestUser } from '@voucha/test-helpers'
import { recordPostPublicationChange } from '../services/post-publication/capture.mts'
import {
  claimPostPublicationDirtyWork,
  updatePostPublicationDirtyWorkCursors,
} from '../services/post-publication/dirty-work.mts'
import { listPublicationCandidates } from '../services/post-publication/publication-candidates.mts'
import {
  reconcilePostPublicationDirtyWork,
  type ReconciliationPost,
} from '../services/post-publication/reconcile.mts'
import type { ClaimedPostPublicationDirtyWork } from '../services/post-publication/types.mts'
import {
  readTestPublicationSnapshot,
  type PublicationProjectionIdentity,
} from './entities/post-publication-snapshots.mts'

/** Commit a publication capture using the same transaction boundary as callers. */
export async function recordTestPostPublicationChange(
  input: Parameters<typeof recordPostPublicationChange>[1],
): Promise<Awaited<ReturnType<typeof recordPostPublicationChange>>> {
  await using transaction = await beginTransaction()
  const work = await recordPostPublicationChange(transaction, input)
  await transaction.commit()
  return work
}

export async function createTestPendingPostIdentityIds(): Promise<{
  candidateId: string
  ancestorId: string
}> {
  const { rows } = await write<{ candidate_id: string; ancestor_id: string }>(
    '/* createTestPendingIdentityIds */ SELECT uuidv7() AS candidate_id, uuidv7() AS ancestor_id',
  )
  return { candidateId: rows[0]!.candidate_id, ancestorId: rows[0]!.ancestor_id }
}

/** Start a scoped test window immediately before one synthetic UUIDv7 post. */
export function testUuidPredecessor(uuid: string): string {
  const value = (BigInt(`0x${uuid.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

/** Exercise the real scope selector in a one-post physical window. */
export function testPublicationWorkAtPost(
  work: ClaimedPostPublicationDirtyWork,
  postId: string,
): ClaimedPostPublicationDirtyWork {
  return { ...work, cursor_post_id: testUuidPredecessor(postId) }
}

export async function reconcileTestPublicationUntilSnapshotsComplete(
  work: ClaimedPostPublicationDirtyWork,
  limit?: number,
  selectedPostIds?: readonly string[],
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    // Retries consume durable sequential snapshot cursors.
    const result = await reconcilePostPublicationDirtyWork(work, limit, selectedPostIds)
    if (!result.hasIncompleteSnapshots) return result
  }
  throw new Error('Test publication snapshot did not converge')
}

/** Follow real raw/ancestor cursor pages to the first complete post sweep. */
export async function reconcileTestPublicationThroughPostSweep(
  work: ClaimedPostPublicationDirtyWork,
  limit?: number,
  startAtPostId?: string,
): Promise<{
  posts: ReconciliationPost[]
  final: Awaited<ReturnType<typeof reconcilePostPublicationDirtyWork>>
}> {
  if (startAtPostId && !work.post_identity_id && !work.author_identity_id)
    throw new TypeError('Owned post window requires a post- or author-scoped work item')
  // The caller must prove its scope owns no earlier posts. The real raw-page
  // selector and continuation still decide membership in this bounded window.
  let cursor = startAtPostId ? testUuidPredecessor(startAtPostId) : work.cursor_post_id
  let pendingPostId = work.pending_post_identity_id
  let pendingAncestorId = work.pending_ancestor_post_identity_id
  const posts: ReconciliationPost[] = []
  const seen = new Set<string>()
  for (let page = 0; page < 32; page += 1) {
    const state = `${cursor ?? ''}:${pendingPostId ?? ''}:${pendingAncestorId ?? ''}`
    if (seen.has(state)) throw new Error(`Publication test cursor recycled: ${state}`)
    seen.add(state)
    const result = await reconcileTestPublicationUntilSnapshotsComplete(
      {
        ...work,
        cursor_post_id: cursor,
        pending_post_identity_id: pendingPostId,
        pending_ancestor_post_identity_id: pendingAncestorId,
      },
      limit,
    )
    posts.push(...result.posts)
    if (!result.hasMorePosts) return { posts, final: result }
    if (
      result.cursorPostId === cursor &&
      result.pendingPostId === pendingPostId &&
      result.pendingAncestorId === pendingAncestorId
    )
      throw new Error('Publication raw cursor did not advance')
    if (
      cursor &&
      result.cursorPostId &&
      BigInt(`0x${result.cursorPostId.replaceAll('-', '')}`) <
        BigInt(`0x${cursor.replaceAll('-', '')}`)
    )
      throw new Error('Publication raw cursor moved backward')
    // Pending ancestry resolves from the generation-fenced work row on the writer.
    // Persist its pair before the next page, as the production processor does.
    if (pendingPostId || result.pendingPostId) {
      const updated = await updatePostPublicationDirtyWorkCursors(
        { id: work.id, generation: work.generation, leaseToken: work.lease_token },
        {
          postId: result.cursorPostId,
          pendingPostId: result.pendingPostId,
          pendingAncestorId: result.pendingAncestorId,
        },
      )
      if (!updated) throw new Error('Publication test pending ancestry lease was lost')
    }
    cursor = result.cursorPostId
    pendingPostId = result.pendingPostId
    pendingAncestorId = result.pendingAncestorId
  }
  throw new Error('Publication test sweep exceeded 32 bounded continuations')
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
