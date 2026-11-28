import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getTopicsWorkLimit } from '@services/topics/work-limits'
import sql from 'sql-template-strings'
import assert from 'http-assert'

export async function replaceTopicRecommendationLandingPageUrls(
  postId: string,
  urlIds: string[],
  options: QueryOptions,
): Promise<void> {
  assert(
    options.query || options.client,
    500,
    'Recommendation URL replacement requires a transaction',
  )
  const batchSize = getTopicsWorkLimit('alias_post_invalidation_batch_size')
  while (true) {
    // oxlint-disable no-await-in-loop -- bounded batch DELETE clears prior recommendation landing page URLs within this transaction
    // no-mistakes-disable-next-line query-reached-per-item: batched DELETE of prior recommendation landing page URLs in DynamicConfig alias_post_invalidation_batch_size pages (hard max 1000)
    const { rowCount } = await write(
      sql`/* replaceTopicRecommendationLandingPageUrls */
        WITH target AS (
          SELECT post_id, url_id
          FROM post_topic_recommendation_landing_page_urls
          WHERE post_id = ${postId}
          ORDER BY url_id
          LIMIT ${batchSize}
        )
        DELETE FROM post_topic_recommendation_landing_page_urls existing
        USING target
        WHERE existing.post_id = target.post_id
          AND existing.url_id = target.url_id`,
      options,
    )
    // oxlint-enable no-await-in-loop
    if ((rowCount ?? 0) < batchSize) break
  }
  if (urlIds.length === 0) return
  await write(
    sql`/* replaceTopicRecommendationLandingPageUrls */
    INSERT INTO post_topic_recommendation_landing_page_urls (post_id, url_id, sort_order)
    SELECT ${postId}::uuid, url_id, ordinal - 1
    FROM UNNEST(${urlIds}::uuid[]) WITH ORDINALITY AS input(url_id, ordinal)
    ORDER BY url_id`,
    options,
  )
}
