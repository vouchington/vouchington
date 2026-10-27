import { write } from '@data-stores/psql'
import { getPostPublicationWorkLimit } from './work-limits.mts'

export const LIVE_SCOPE_POST_KINDS = [
  'author_posts',
  'community_posts',
  'post_descendants',
  'alias_post_relations',
  'alias_post_sources',
  'story_posts',
] as const
export type LiveScopePostKind = (typeof LIVE_SCOPE_POST_KINDS)[number]
const MIN_UUID = '00000000-0000-0000-0000-000000000000'

/** Discovers affected live rows by one indexed owner and a bounded keyset page. */
export async function listLiveScopePostPage(
  kind: LiveScopePostKind,
  subjectId: string,
  after: string | null,
): Promise<{ ids: string[]; cursor: string | null }> {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  if (kind === 'alias_post_sources') {
    const cursor: unknown = after ? JSON.parse(after) : [MIN_UUID, MIN_UUID]
    if (!Array.isArray(cursor) || cursor.length !== 2 || cursor.some(id => typeof id !== 'string'))
      throw new TypeError('Alias publication cursor requires a post and source identifier')
    const { rows } = await write<{ post_id: string; id: string }>(
      `/* listLiveScopePostPage:aliasSources */
      SELECT post_id, id FROM post_topic_alias_sources
      WHERE topic_alias_id = $1::uuid AND (post_id, id) > ($2::uuid, $3::uuid)
      ORDER BY post_id, id LIMIT $4`,
      [subjectId, cursor[0], cursor[1], limit],
    )
    const last = rows.at(-1)
    return {
      ids: [...new Set(rows.map(row => row.post_id))],
      cursor: rows.length === limit && last ? JSON.stringify([last.post_id, last.id]) : null,
    }
  }
  const statement =
    kind === 'author_posts'
      ? `/* listLiveScopePostPage:author */ SELECT id FROM posts
       WHERE created_by_id = $1::uuid AND id > $2::uuid ORDER BY id LIMIT $3`
      : kind === 'community_posts'
        ? `/* listLiveScopePostPage:community */ SELECT id FROM posts
         WHERE community_id = $1::uuid AND id > $2::uuid ORDER BY id LIMIT $3`
        : kind === 'post_descendants'
          ? `/* listLiveScopePostPage:descendants */ SELECT id FROM posts
           WHERE parent_post_id = $1::uuid AND id > $2::uuid ORDER BY id LIMIT $3`
          : kind === 'alias_post_relations'
            ? `/* listLiveScopePostPage:aliasRelations */ SELECT subject_id AS id,
               deleted_at IS NULL AND votes_score_net > 0 AS is_live
             FROM relation__post__category__topic_alias
             WHERE object_id = $1::uuid AND subject_id > $2::uuid
             ORDER BY subject_id LIMIT $3`
            : `/* listLiveScopePostPage:story */ SELECT post_id AS id FROM story_posts
             WHERE story_id = $1::uuid AND post_id > $2::uuid ORDER BY post_id LIMIT $3`
  const { rows } = await write<{ id: string; is_live?: boolean }>(statement, [
    subjectId,
    after ?? MIN_UUID,
    limit,
  ])
  return {
    ids: rows.flatMap(row => (row.is_live === false ? [] : [row.id])),
    cursor: rows.length === limit ? rows.at(-1)!.id : null,
  }
}
