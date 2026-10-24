import { beginTransaction, write } from '@data-stores/psql'
import { recordPostPublicationChange } from '@services/post-publication/public'
import {
  claimPostPublicationDirtyWork,
  updatePostPublicationDirtyWorkCursors,
} from '@services/post-publication/dirty-work'
import { listPublicationCandidatePage } from '@services/post-publication/publication-candidates'
import { contentHash, seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

const CHAIN_DEPTH = 102

/** The oldest eligible ancestor sits beyond one strict 100-row parent-walk budget. */
export async function runDeepPublicationAncestry3511Scenario(): Promise<void> {
  const rootId = seedUuid(0, '05')
  const userId = seedUuid(0, '01')
  const hash = contentHash('deep-publication-ancestry-3511')
  // A deleted identity must never relink to a recreated post. Give every
  // invocation fresh, ordered UUIDv7 descendants while preserving the strict
  // 100-ancestor boundary and the canonical child-after-parent constraints.
  const chainStartMs = Date.now() - (CHAIN_DEPTH + 1) * 1_000
  const commentId = (depth: number): string =>
    seedUuidAtTimestamp(chainStartMs + depth * 1_000, 900_000 + depth)
  const firstId = commentId(1)
  const deepestId = commentId(CHAIN_DEPTH)
  await using transaction = await beginTransaction()
  for (let depth = 1; depth <= CHAIN_DEPTH; depth++) {
    const id = commentId(depth)
    const parentId = depth === 1 ? rootId : commentId(depth - 1)
    // no-mistakes-disable-next-line query-reached-per-item: exactly 102 FK-dependent ancestors are inserted parent-first on one transaction client for the strict 100-row boundary proof.
    await transaction(
      `/* seedDeepPublicationAncestry3511 */ INSERT INTO posts
       (id, post_type, created_by_id, markdown, parent_post_id, root_post_id,
        bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256, created_via)
       VALUES ($1::uuid, 'comment'::post_types, $2::uuid, $3, $4::uuid, $5::uuid, $6, $6, 'system')
       ON CONFLICT DO NOTHING`,
      [id, userId, `Deep publication comment ${depth}`, parentId, rootId, hash],
    )
  }
  const work = await recordPostPublicationChange(transaction, {
    scope: { type: 'post', postId: firstId },
    reason: 'post_updated',
  })
  await transaction.commit()
  try {
    await write('/* analyzeDeepPublicationAncestry3511 */ ANALYZE posts')
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected deep publication work lease')
    registerScenarioContract('post-publication-deep-ancestor-page', {
      seededRows: { posts: 100_000 },
      expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 100 }],
    })
    await runAndCapture(
      'post-publication-deep-ancestor-page',
      async () => {
        const nearEnd = { ...claimed, cursor_post_id: uuidPredecessor(deepestId) }
        const first = await listPublicationCandidatePage(nearEnd, 10)
        if (first.pendingPostId !== deepestId || !first.pendingAncestorId)
          throw new Error('Expected strict bounded pending ancestor walk')
        if (
          !(await updatePostPublicationDirtyWorkCursors(
            { id: claimed.id, generation: claimed.generation, leaseToken: claimed.lease_token },
            {
              postId: first.cursorPostId,
              pendingPostId: first.pendingPostId,
              pendingAncestorId: first.pendingAncestorId,
            },
          ))
        )
          throw new Error('Expected fenced pending identity checkpoint')
        const resumed = await listPublicationCandidatePage(
          {
            ...nearEnd,
            pending_post_identity_id: first.pendingPostId,
            pending_ancestor_post_identity_id: first.pendingAncestorId,
          },
          10,
        )
        if (resumed.posts.map(post => post.id).join() !== deepestId)
          throw new Error('Expected deep descendant after bounded continuation')
      },
      undefined,
      'readPublicationCandidateAncestors',
    )
  } finally {
    await write(
      '/* removeDeepPublicationAncestry3511Keys */ DELETE FROM post_publication_dirty_work_keys WHERE dirty_work_id = $1::uuid',
      [work.id],
    )
    await write(
      '/* removeDeepPublicationAncestry3511Work */ DELETE FROM post_publication_dirty_work WHERE id = $1::uuid',
      [work.id],
    )
    await write(
      '/* removeDeepPublicationAncestry3511Posts */ DELETE FROM posts WHERE id = $1::uuid',
      [firstId],
    )
  }
}

function uuidPredecessor(uuid: string): string {
  const value = (BigInt(`0x${uuid.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}
