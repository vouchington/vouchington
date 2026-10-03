import { assertDelegatedCommunityWritable } from './authorization.mts'
import { lockCommunityUser } from '@services/communities/bans/lock'
import createHttpError from 'http-errors'
import { getCommentAncestorsByAny } from '@services/comments/ancestors'
import { getPostByAny } from './get.mts'
import type { TransactionQuery } from '@data-stores/psql'
import { lockPostPublicationPostScopes } from '@services/post-publication'
import { runSequentially } from '@modules/utils/run-sequentially'
import sql from 'sql-template-strings'

/** Lock the same publication and thread fences as privacy edits/deletion and thread locking. */
export async function lockDelegatedPostThread(
  query: TransactionQuery,
  postId: string,
  actorId: string,
): Promise<void> {
  const post = await getPostByAny(postId, { query })
  if (!post) throw createHttpError(404, 'Post not found')
  const nodes =
    post.post_type === 'comment' ? await getCommentAncestorsByAny(postId, { query }) : [post]
  if (nodes.at(-1)?.id !== post.id || nodes[0]?.id !== (post.root_id ?? post.id))
    throw createHttpError(404, 'Post not found')
  if (post.community_id) await lockDelegatedPostCommunity(query, post.community_id, actorId)
  const ids = nodes.map(node => node.id).toSorted()
  await runSequentially([
    () => lockPostPublicationPostScopes(query, ids),
    () =>
      query(sql`/* lockDelegatedPostThread */
      SELECT pg_advisory_xact_lock(hashtextextended(id::text, 0))
      FROM unnest(${ids}::uuid[]) AS input(id) ORDER BY id`),
    () =>
      query(sql`/* lockDelegatedPostThread.rows */
      SELECT id FROM posts WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`),
  ])
}

/** Settings UPDATEs and visibility changes take the same physical community row fence. */
export async function lockDelegatedPostCommunity(
  query: TransactionQuery,
  communityId: string,
  actorId: string,
): Promise<void> {
  await runSequentially([
    () => lockCommunityUser(communityId, actorId, { query }),
    // leaveCommunity uses only this row UPDATE; removals/bans also hold the pair advisory fence.
    () =>
      query(sql`/* lockDelegatedPostCommunity.membership */
    SELECT id FROM community_members
    WHERE community_id = ${communityId} AND user_id = ${actorId} AND removed_at IS NULL
    FOR UPDATE`),
  ])
  const { rows } = await query<{ archived_at: Date | null }>(sql`/* lockDelegatedPostCommunity */
    SELECT archived_at FROM communities WHERE id = ${communityId} AND deleted_at IS NULL FOR UPDATE`)
  const community = rows[0]
  if (!community) throw createHttpError(404, 'Post not found')
  assertDelegatedCommunityWritable(community)
}
