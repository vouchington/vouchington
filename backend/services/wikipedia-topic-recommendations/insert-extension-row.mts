import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { MaterializedTopicRecommendationInput } from './materialize-topic-recommendation.mts'

export async function insertTopicRecommendationExtensionRow(
  postId: string,
  materialized: MaterializedTopicRecommendationInput,
  options: QueryOptions,
): Promise<void> {
  await write(
    sql`/* insertTopicRecommendationExtensionRow */
      INSERT INTO post_topic_recommendations (
        post_id, topic_title, topic_slug, topic_markdown, aliases, hostname_id,
        topic_wikipedia_pageid, topic_type, example_referral_link, landing_page_urls,
        approval_error_message
      ) VALUES (
        ${postId}, ${materialized.topic_title}, ${materialized.topic_slug},
        ${materialized.topic_markdown}, ${materialized.topic_aliases}, ${materialized.hostname_id},
        ${materialized.topic_wikipedia_pageid}, ${materialized.topic_type ?? 'topic'},
        ${materialized.example_referral_link ?? null}, ${materialized.landing_page_urls ?? []}, NULL
      )
    `,
    options,
  )
}
