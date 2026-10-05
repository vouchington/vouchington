import type { OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PersistedClassifierDecision, PersistedClassifierDecisionResult } from './types.mts'

type PersistedTopicDecisionResult = Extract<
  PersistedClassifierDecisionResult,
  { candidateKind: 'topic' }
>

export async function recordTopicVoteApplication(
  query: OwnedTransaction,
  sharedActorId: string,
  decision: PersistedClassifierDecision,
  result: PersistedTopicDecisionResult,
): Promise<boolean> {
  await query(sql`/* lockClassifierTopicVoteApplication */
    SELECT pg_advisory_xact_lock(
      hashtextextended('topic_votes:' || ${sharedActorId} || ':' || ${result.topicId}, 0)
    )
  `)
  const { rows: supersedingRows } = await query<{ exists: boolean }>(sql`
    /* readSupersedingClassifierTopicVoteApplication */
    SELECT EXISTS (
      SELECT 1
      FROM classifier_topic_vote_applications
      WHERE shared_actor_user_id = ${sharedActorId}
        AND topic_id = ${result.topicId}
        AND batch_id >= ${decision.batchId}
    ) AS exists
  `)
  if (supersedingRows[0]?.exists) return false
  const { rows } = await query<{ batch_id: string }>(sql`
    /* recordTopicClassifierVoteApplication */
    INSERT INTO classifier_topic_vote_applications (
      shared_actor_user_id, topic_id, post_id, rss_feed_item_id, classifier_id,
      prompt_version_id, batch_id, result_id
    ) VALUES (
      ${sharedActorId}, ${result.topicId}, ${decision.subject.postId}, ${decision.subject.rssFeedItemId},
      ${decision.classifierId}, ${decision.promptVersionId}, ${decision.batchId}, ${result.id}
    )
    ON CONFLICT (shared_actor_user_id, topic_id, post_id, rss_feed_item_id)
    DO UPDATE SET
      classifier_id = EXCLUDED.classifier_id,
      prompt_version_id = EXCLUDED.prompt_version_id,
      batch_id = EXCLUDED.batch_id,
      result_id = EXCLUDED.result_id
    WHERE classifier_topic_vote_applications.batch_id < EXCLUDED.batch_id
    RETURNING batch_id
  `)
  return rows.length === 1
}
