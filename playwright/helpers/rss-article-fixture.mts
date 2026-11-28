import { allowUnannotatedQuery } from '@vouchington/postgres'
import { write } from '../../backend/data-stores/psql/clients.mts'

export async function upsertTestArticleUrl(input: {
  url: string
  hostnameId: string
  pathname: string
}): Promise<string> {
  const result = await write(
    `/* playwright upsertTestArticleUrl */
     INSERT INTO urls (url, hostname_id, pathname, search_params)
     VALUES ($1, $2, $3, '{}'::JSONB)
     ON CONFLICT (url) DO UPDATE SET hostname_id = EXCLUDED.hostname_id
     RETURNING id`,
    [input.url, input.hostnameId, input.pathname],
  )
  return result.rows[0].id as string
}

export async function cleanupTestRssFeedFixture(input: {
  feedId?: string
  rssItemId?: string
  topicId?: string
  urlId?: string
  deleteItemSource?: boolean
  errorContext: string
}): Promise<void> {
  const errors: unknown[] = []
  if (input.deleteItemSource && input.feedId && input.rssItemId) {
    try {
      await write(
        `/* playwright cleanupTestRssFeedFixture rss_feed_item_sources */
         DELETE FROM rss_feed_item_sources
         WHERE rss_feed_id = $1 AND rss_feed_item_id = $2`,
        [input.feedId, input.rssItemId],
      )
    } catch (err) {
      errors.push(err)
    }
  }
  if (input.feedId) {
    try {
      await write(allowUnannotatedQuery('DELETE FROM rss_feeds WHERE id = $1'), [input.feedId])
    } catch (err) {
      errors.push(err)
    }
  }
  if (input.rssItemId) {
    try {
      await write(allowUnannotatedQuery('DELETE FROM rss_feed_item_guids WHERE id = $1'), [
        input.rssItemId,
      ])
    } catch (err) {
      errors.push(err)
    }
  }
  if (input.urlId) {
    try {
      await write(allowUnannotatedQuery('DELETE FROM urls WHERE id = $1'), [input.urlId])
    } catch (err) {
      errors.push(err)
    }
  }
  if (input.topicId) {
    try {
      await write(allowUnannotatedQuery('DELETE FROM topics WHERE id = $1'), [input.topicId])
    } catch (err) {
      errors.push(err)
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, input.errorContext)
  }
}
