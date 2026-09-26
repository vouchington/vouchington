import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql'
import type { SourceRow } from './identity-source-paging.mts'
import { nativeSourceBounds, nativeSourceRange } from './native-source-range.mts'
import { publicationPageLimit } from './page-limit.mts'

export async function listFeedRows(
  query: TransactionQuery,
  postId: string,
  cursor: string | null,
  limit: number,
): Promise<SourceRow[]> {
  const [itemId, feedId] =
    cursor === null ? [null, null] : (JSON.parse(cursor) as [string, string | null])
  const itemStatement = sql`/* listPublicationIdentityFeedItem */
    SELECT item.id FROM posts candidate JOIN post__stories story ON story.post_id = COALESCE(candidate.root_id, candidate.id)
      JOIN rss_feed_items item ON item.story_id = story.story_id AND item.deleted_at IS NULL
    WHERE candidate.id = ${postId}
      AND (item.story_id, item.id) >= (story.story_id, ${itemId ?? '00000000-0000-0000-0000-000000000000'}::uuid)
      AND item.story_id <= story.story_id ORDER BY item.story_id, item.id LIMIT 1`
  const { rows: items } = await query<{ id: string }>(itemStatement)
  const item = items[0]
  if (!item) return []
  const sourceStatement = sql`/* listPublicationIdentityFeedSourcePage */ WITH `.append(
    nativeSourceBounds(item.id),
  ).append(sql`
    SELECT 'rss_feed'::text AS kind, rss_feed_id::text AS "uuidValue", NULL::text AS "textValue", NULL::text AS "postType", NULL::text AS day,
      jsonb_build_array(rss_feed_item_id::text, rss_feed_id::text)::text AS cursor FROM rss_feed_item_sources CROSS JOIN native_bounds
    WHERE `)
  sourceStatement.append(
    nativeSourceRange(
      'rss_feed_item_id',
      ['rss_feed_id'],
      item.id === itemId && feedId !== null ? [feedId] : null,
    ),
  )
  sourceStatement
    .append(sql` ORDER BY rss_feed_item_id, rss_feed_id LIMIT `)
    .append(publicationPageLimit(limit))
  const { rows } = await query<SourceRow>(sourceStatement)
  if (rows.length > 0) return rows
  const { rows: next } = await query<{ id: string }>(sql`/* advancePublicationIdentityFeedItem */
    SELECT item.id FROM posts candidate JOIN post__stories story ON story.post_id = COALESCE(candidate.root_id, candidate.id)
      JOIN rss_feed_items item ON item.story_id = story.story_id AND item.deleted_at IS NULL
    WHERE candidate.id = ${postId} AND (item.story_id, item.id) > (story.story_id, ${item.id}::uuid)
      AND item.story_id <= story.story_id ORDER BY item.story_id, item.id LIMIT 1`)
  return next[0]
    ? [
        {
          kind: null,
          uuidValue: null,
          textValue: null,
          postType: null,
          day: null,
          cursor: JSON.stringify([next[0].id, null]),
        },
      ]
    : []
}
