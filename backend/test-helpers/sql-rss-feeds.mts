import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getRssFeedImportFollowForTest(importId: string): Promise<boolean> {
  const { rows } = await read<{ follow: boolean }>(sql`/* getRssFeedImportFollowForTest */
    SELECT follow
    FROM user_rss_feed_import_batches
    WHERE id = ${importId}
    LIMIT 1
  `)
  return rows[0]!.follow
}

export async function softDeleteRssFeedItemsForTest(itemIds: string[]): Promise<void> {
  await write(sql`/* softDeleteRssFeedItemsForTest */
    UPDATE rss_feed_items
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ANY(${itemIds}::uuid[])
  `)
}

export async function restoreRssFeedItemsForTest(itemIds: string[]): Promise<void> {
  await write(sql`/* restoreRssFeedItemsForTest */
    UPDATE rss_feed_items
    SET deleted_at = NULL
    WHERE id = ANY(${itemIds}::uuid[])
  `)
}

export async function setRssFeedDeclaredLanguageForTest(
  feedId: string,
  declaredLanguage: string | null,
): Promise<void> {
  await write(sql`/* setRssFeedDeclaredLanguageForTest */
    UPDATE rss_feeds
    SET declared_language = ${declaredLanguage}
    WHERE id = ${feedId}
  `)
}

export async function getRssFeedDeclaredLanguageForTest(feedId: string): Promise<string | null> {
  const { rows } = await read<{ declared_language: string | null }>(
    sql`/* getRssFeedDeclaredLanguageForTest */
      SELECT declared_language
      FROM rss_feeds
      WHERE id = ${feedId}
    `,
  )
  return rows[0]?.declared_language ?? null
}

export async function getRssFeedTypeForTest(feedId: string): Promise<string | null> {
  const { rows } = await read<{ feed_type: string }>(
    sql`/* getRssFeedTypeForTest */
      SELECT feed_type
      FROM rss_feeds
      WHERE id = ${feedId}
    `,
  )
  return rows[0]?.feed_type ?? null
}

export async function getRssFeedIgnoreRobotsTxtForTest(feedId: string): Promise<boolean | null> {
  const { rows } = await read<{ ignore_robots_txt: boolean | null }>(
    sql`/* getRssFeedIgnoreRobotsTxtForTest */
      SELECT ignore_robots_txt
      FROM rss_feeds
      WHERE id = ${feedId}
    `,
  )
  return rows[0]?.ignore_robots_txt ?? null
}

export async function getRssFeedUnreliableStatusCodesForTest(
  feedId: string,
): Promise<number[] | null> {
  const { rows } = await read<{ unreliable_status_codes: number[] | null }>(
    sql`/* getRssFeedUnreliableStatusCodesForTest */
      SELECT unreliable_status_codes
      FROM rss_feeds
      WHERE id = ${feedId}
    `,
  )
  return rows[0]?.unreliable_status_codes ?? null
}

export async function countEnabledRssFeedsForTest(): Promise<number> {
  const { rows } = await read<{ count: number }>(
    `/* countEnabledRssFeedsForTest */
    SELECT COUNT(*)::INT AS count
    FROM rss_feeds
    WHERE is_enabled = TRUE AND deleted_at IS NULL`,
    [],
  )
  return Number(rows[0]?.count ?? 0)
}

export async function getRssFeedItemTitleByGuidForTest(guid: string): Promise<string | undefined> {
  const { rows } = await read<{
    data: { title: string }
  }>(sql`/* getRssFeedItemTitleByGuidForTest */
    SELECT items.data
    FROM rss_feed_item_ids ids
    JOIN rss_feed_items items ON items.id = ids.id
    WHERE ids.guid = ${guid}
    LIMIT 1
  `)
  return rows[0]?.data.title
}
