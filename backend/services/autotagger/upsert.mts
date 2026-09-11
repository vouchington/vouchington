import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PostAutotagResult, RssFeedItemAutotagResult } from './types.mts'

export async function insertPostAutotaggingResult(
  post_id: string,
  content_sha256: Buffer,
  prompt_id: string,
  topics_added: string[],
): Promise<PostAutotagResult> {
  const uniqueTopicIds = dedupeTopicIds(topics_added)

  const { rows } = await write(sql`/* insertPostAutotaggingResult */
    WITH inserted_result AS (
      INSERT INTO post_autotagger_results (
        post_id,
        prompt_id,
        content_sha256
      ) VALUES (${post_id}, ${prompt_id}, ${content_sha256})
      ON CONFLICT (post_id, prompt_id)
      DO UPDATE SET content_sha256 = EXCLUDED.content_sha256
      RETURNING post_id, prompt_id, content_sha256, created_at
    ),
    deleted_topics AS (
      DELETE FROM post_autotagger_result_topics
      WHERE post_id = (SELECT post_id FROM inserted_result)
        AND prompt_id = (SELECT prompt_id FROM inserted_result)
      RETURNING 1
    ),
    inserted_topics AS (
      INSERT INTO post_autotagger_result_topics (post_id, prompt_id, topic_id, topic_order)
      SELECT
        (SELECT post_id FROM inserted_result),
        (SELECT prompt_id FROM inserted_result),
        topic_id,
        topic_order
      FROM unnest(${uniqueTopicIds}::uuid[]) WITH ORDINALITY AS t(topic_id, topic_order)
      WHERE EXISTS (SELECT 1 FROM inserted_result)
        AND ((SELECT COUNT(*) FROM deleted_topics) >= 0) -- Forces CTE execution ordering: ensures deleted_topics completes before inserted_topics
      RETURNING post_id, prompt_id, topic_id
    )
    SELECT
      r.post_id,
      r.prompt_id,
      r.content_sha256,
      r.created_at,
      COALESCE(
        (SELECT json_agg(topic_id ORDER BY topic_order)
         FROM unnest(${uniqueTopicIds}::uuid[]) WITH ORDINALITY AS t(topic_id, topic_order)),
        '[]'::json
      ) AS topics_added
    FROM inserted_result r
  `)

  return rows[0]
}

export async function insertRssFeedItemAutotaggingResult(
  rss_feed_item_id: string,
  content_sha256: Buffer,
  prompt_id: string,
  topics_added: string[],
): Promise<RssFeedItemAutotagResult> {
  const uniqueTopicIds = dedupeTopicIds(topics_added)

  const { rows } = await write(sql`/* insertRssFeedItemAutotaggingResult */
    WITH inserted_result AS (
      INSERT INTO rss_feed_item_autotagger_results (
        rss_feed_item_id,
        content_sha256,
        prompt_id
      ) VALUES (${rss_feed_item_id}, ${content_sha256}, ${prompt_id})
      ON CONFLICT (rss_feed_item_id, content_sha256, prompt_id)
      DO UPDATE SET content_sha256 = EXCLUDED.content_sha256
      RETURNING id, rss_feed_item_id, content_sha256, prompt_id, created_at
    ),
    deleted_topics AS (
      DELETE FROM rss_feed_item_autotagger_result_topics
      WHERE rss_feed_item_autotagger_result_id = (SELECT id FROM inserted_result)
      RETURNING 1
    ),
    inserted_topics AS (
      INSERT INTO rss_feed_item_autotagger_result_topics (rss_feed_item_autotagger_result_id, topic_id, topic_order)
      SELECT
        (SELECT id FROM inserted_result),
        topic_id,
        topic_order
      FROM unnest(${uniqueTopicIds}::uuid[]) WITH ORDINALITY AS t(topic_id, topic_order)
      WHERE EXISTS (SELECT 1 FROM inserted_result)
        AND ((SELECT COUNT(*) FROM deleted_topics) >= 0) -- Forces CTE execution ordering: ensures deleted_topics completes before inserted_topics
      RETURNING rss_feed_item_autotagger_result_id, topic_id
    )
    SELECT
      r.id,
      r.rss_feed_item_id,
      r.content_sha256,
      r.prompt_id,
      r.created_at,
      COALESCE(
        (SELECT json_agg(topic_id ORDER BY topic_order)
         FROM unnest(${uniqueTopicIds}::uuid[]) WITH ORDINALITY AS t(topic_id, topic_order)),
        '[]'::json
      ) AS topics_added
    FROM inserted_result r
  `)

  return rows[0]
}

function dedupeTopicIds(topicIds: string[]): string[] {
  return [...new Set(topicIds)]
}
