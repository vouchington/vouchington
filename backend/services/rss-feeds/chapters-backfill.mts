import { read } from '@data-stores/psql'
import type { RssFeedItemToUpsert } from '@services/rss-feed-items/types'
import sql from 'sql-template-strings'

type ChapterReference = {
  guid: string
  chapters_url: string | null
  chapters_type: string | null
}

export async function rssFeedNeedsChapterMetadataBackfill(
  rssFeedId: string,
  feedItems: RssFeedItemToUpsert[],
): Promise<boolean> {
  const chapterReferences = getChapterReferences(feedItems)
  if (chapterReferences.length === 0) return false

  const query = sql`/* rssFeedNeedsChapterMetadataBackfill */
    WITH parsed(guid, chapters_url, chapters_type) AS (VALUES `
  chapterReferences.forEach((item, index) => {
    if (index > 0) query.append(sql`, `)
    query.append(sql`(${item.guid}, ${item.chapters_url}, ${item.chapters_type})`)
  })
  query.append(sql`)
    SELECT EXISTS (
      SELECT 1
      FROM parsed p
      WHERE NOT EXISTS (
        SELECT 1
        FROM rss_feed_item_sources s
        JOIN rss_feed_items i ON i.id = s.rss_feed_item_id
        JOIN rss_feed_item_ids identity ON identity.id = i.id
        WHERE s.rss_feed_id = ${rssFeedId}
          AND identity.guid = p.guid
          AND i.deleted_at IS NULL
          AND i.data->>'chapters_url' IS NOT DISTINCT FROM p.chapters_url
          AND i.data->>'chapters_type' IS NOT DISTINCT FROM p.chapters_type
      )
    ) AS needs_backfill`)

  const {
    rows: [row],
  } = await read<{ needs_backfill: boolean }>(query)
  return row?.needs_backfill === true
}

function getChapterReferences(feedItems: RssFeedItemToUpsert[]): ChapterReference[] {
  const referencesByGuid = new Map<string, ChapterReference>()
  for (const item of feedItems) {
    if (item.chapters_url == null && item.chapters_type == null) continue
    referencesByGuid.set(item.guid, {
      guid: item.guid,
      chapters_url: item.chapters_url ?? null,
      chapters_type: item.chapters_type ?? null,
    })
  }
  return [...referencesByGuid.values()]
}
