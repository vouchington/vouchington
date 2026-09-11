import { createAsyncGeneratorFromCursor, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { escapeHtml } from '@ts-shared/utils/html'

export type ExportRssFeed = {
  title: string
  rss_feed_url: string
  feed_type: string
  topic_name: string
  topic_slug: string
  home_page_url: string | null
}

export function streamUserRssFeeds(
  currentUserId: string,
  maxItems: number,
  feedType?: string,
): AsyncGenerator<ExportRssFeed> {
  const query = sql`/* exportUserRssFeeds */
      SELECT
        rf.title,
        u.url AS rss_feed_url,
        rf.feed_type,
        t.name AS topic_name,
        t.slug AS topic_slug,
        CASE
          WHEN uh.hostname IS NOT NULL THEN CONCAT('https://', uh.hostname, '/')
          ELSE NULL
        END AS home_page_url
      FROM relation__user__follow__rss_feed r
      JOIN rss_feeds rf ON rf.id = r.object_id
      JOIN urls u ON u.id = rf.rss_feed_url_id
      JOIN topics t ON t.id = rf.topic_id
      LEFT JOIN url_hostnames uh ON uh.id = t.hostname_id
      WHERE r.subject_id = ${currentUserId}
        AND r.deleted_at IS NULL
        AND rf.deleted_at IS NULL
        AND t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL`
  if (feedType) {
    query.append(sql` AND rf.feed_type = ${feedType}`)
  }
  query.append(sql` ORDER BY rf.title ASC, rf.id ASC LIMIT ${maxItems}`)
  return createAsyncGeneratorFromCursor<ExportRssFeed>(query, { batchSize: 1000 })
}

export async function userRssFeedExportExceedsLimit(
  currentUserId: string,
  maxItems: number,
  feedType?: string,
): Promise<boolean> {
  const query = sql`/* userRssFeedExportExceedsLimit */
      SELECT COUNT(*)::int AS count
      FROM relation__user__follow__rss_feed r
      JOIN rss_feeds rf ON rf.id = r.object_id
      JOIN topics t ON t.id = rf.topic_id
      WHERE r.subject_id = ${currentUserId}
        AND r.deleted_at IS NULL
        AND rf.deleted_at IS NULL
        AND t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL`
  if (feedType) query.append(sql` AND rf.feed_type = ${feedType}`)
  const { rows } = await read<{ count: number }>(query)
  return rows[0]!.count > maxItems
}

export async function* streamUserRssFeedsAsCsv(
  feeds: AsyncIterable<ExportRssFeed>,
): AsyncGenerator<string> {
  yield 'title,url,feed_type,home_page_url,topic\n'
  for await (const feed of feeds) {
    yield [feed.title, feed.rss_feed_url, feed.feed_type, feed.home_page_url ?? '', feed.topic_name]
      .map(escapeCsvField)
      .join(',')
      .concat('\n')
  }
}

export async function* streamUserRssFeedsAsOpml(
  feeds: AsyncIterable<ExportRssFeed>,
): AsyncGenerator<string> {
  yield '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>RSS Feed Export</title>\n  </head>\n  <body>\n'
  for await (const feed of feeds) {
    const attrs = [
      `text="${escapeHtml(feed.title || feed.topic_name)}"`,
      `xmlUrl="${escapeHtml(feed.rss_feed_url)}"`,
    ]
    if (feed.home_page_url) attrs.push(`htmlUrl="${escapeHtml(feed.home_page_url)}"`)
    attrs.push('type="rss"')
    yield `    <outline ${attrs.join(' ')} />\n`
  }
  yield '  </body>\n</opml>\n'
}

function escapeCsvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}
