import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
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
  await write(
    sql`/* replaceTopicRecommendationLandingPageUrls */
    DELETE FROM post_topic_recommendation_landing_page_urls WHERE post_id = ${postId}`,
    options,
  )
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
