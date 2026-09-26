import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql'
import type { SourceRow } from './identity-source-paging.mts'
import { nativeSourceBounds, nativeSourceRange } from './native-source-range.mts'
import { publicationPageLimit } from './page-limit.mts'
import { publicationStoryItemPageCtes } from './story-item-pages.mts'

export async function listFeedRows(
  query: TransactionQuery,
  postId: string,
  cursor: string | null,
  limit: number,
): Promise<SourceRow[]> {
  const [itemId, feedId, itemComplete = false] =
    cursor === null
      ? [null, null, false]
      : (JSON.parse(cursor) as [string, string | null, boolean?])
  const scope = sql`
    SELECT story.story_id, ${itemId ?? '00000000-0000-0000-0000-000000000000'}::uuid AS cursor_id FROM posts candidate JOIN post__stories story ON story.post_id = COALESCE(candidate.root_id, candidate.id)
    WHERE candidate.id = ${postId}`
  const itemStatement = sql`/* listPublicationIdentityFeedItem */ `.append(
    publicationStoryItemPageCtes(scope, limit, !itemComplete),
  ).append(sql`SELECT items.id, source.rss_feed_id IS NOT NULL AS has_source FROM items
      LEFT JOIN LATERAL (SELECT rss_feed_id FROM rss_feed_item_sources
        WHERE rss_feed_item_id = items.id
          AND rss_feed_id >= '00000000-0000-0000-0000-000000000000'::uuid
        ORDER BY rss_feed_item_id, rss_feed_id LIMIT 1) source ON TRUE ORDER BY items.id`)
  const { rows: items } = await query<{ id: string; has_source: boolean }>(itemStatement)
  const emptyRows: SourceRow[] = []
  const item = items.find(candidate => candidate.has_source)
  for (const candidate of items) {
    if (candidate === item) break
    emptyRows.push(completedItemRow(candidate.id))
  }
  if (!item) return emptyRows
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
    .append(publicationPageLimit(limit - emptyRows.length))
  const { rows } = await query<SourceRow>(sourceStatement)
  return [...emptyRows, ...(rows.length > 0 ? rows : [completedItemRow(item.id)])]
}

function completedItemRow(itemId: string): SourceRow {
  return {
    kind: null,
    uuidValue: null,
    textValue: null,
    postType: null,
    day: null,
    cursor: JSON.stringify([itemId, null, true]),
  }
}
