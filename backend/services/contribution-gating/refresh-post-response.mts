import { write } from '@data-stores/psql'
import type { Post } from '../posts/types.mts'
import sql from 'sql-template-strings'

/** Refreshes only the finalized topic projection in retained create responses. */
export async function refreshContributionAdmissionPostResponses(
  postId: string,
  finalizationGeneration: string,
): Promise<Post['post_related_topics'] | undefined> {
  const { rows } = await write<{
    post_related_topics: NonNullable<Post['post_related_topics']> | null
  }>(sql`/* refreshContributionAdmissionPostResponses */ WITH current_finalization AS MATERIALIZED (
    SELECT post_id, admission_response_generation, generation
    FROM post_category_finalizations
    WHERE post_id = ${postId}
      AND generation = ${finalizationGeneration}
    FOR UPDATE
  ), response_finalization AS (
    SELECT post_id
    FROM current_finalization
    WHERE admission_response_generation = generation
      AND admission_response_generation IS NOT NULL
  ), finalized_topics AS (
    SELECT COALESCE(
      jsonb_agg(TO_JSONB(topic.*) ORDER BY selected.votes_score_net DESC, selected.object_id),
      '[]'::jsonb
    ) AS post_related_topics
    FROM (
      SELECT relation.object_id, relation.votes_score_net
      FROM response_finalization
      INNER JOIN post_category_finalization_admission_topics admission_topic
        ON admission_topic.post_id = response_finalization.post_id
      INNER JOIN relation__post__category__topic relation
        ON relation.object_id = admission_topic.topic_id
      WHERE relation.subject_id = ${postId}
        AND relation.deleted_at IS NULL
        AND relation.votes_score_net > 0
      ORDER BY relation.votes_score_net DESC, relation.object_id
      LIMIT 5
    ) selected
    INNER JOIN view_embedded_topics topic ON topic.id = selected.object_id
  ), refreshed_responses AS (
    UPDATE post_admission_reservations
    SET response = CASE
          WHEN EXISTS (SELECT 1 FROM response_finalization)
          THEN CASE
            WHEN jsonb_typeof(response) = 'object'
              AND jsonb_typeof(response->'post') = 'object'
            THEN jsonb_set(
              response,
              '{post,post_related_topics}',
              (SELECT post_related_topics FROM finalized_topics)
            )
            WHEN jsonb_typeof(response) = 'object'
            THEN jsonb_set(
              response,
              '{post_related_topics}',
              (SELECT post_related_topics FROM finalized_topics)
            )
            ELSE response
          END
          ELSE response
        END,
        replay_metadata = replay_metadata || '{"finalization":"complete"}'::jsonb,
        updated_at = NOW()
    WHERE committed_post_id = ${postId}
      AND state = 'committed'
      AND retention_expires_at > NOW()
      AND EXISTS (SELECT 1 FROM current_finalization)
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM response_finalization)
    THEN (SELECT post_related_topics FROM finalized_topics)
    ELSE NULL
  END AS post_related_topics`)
  return rows[0]?.post_related_topics ?? undefined
}
