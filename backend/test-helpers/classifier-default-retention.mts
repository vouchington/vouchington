import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import type { ClassifierFixtureData } from './data-stores/psql/classifier-fixture-data.mts'

/** An old, completed topic decision whose whole result lineage still occupies DEFAULT. */
export async function seedOldClassifierDefaultDecision(
  fixture: ClassifierFixtureData,
  at: Date,
): Promise<string> {
  const batchId = uuidv7({ msecs: at.getTime() })
  const callId = uuidv7({ msecs: at.getTime() })
  await using query = await beginTransaction()
  await query(sql`/* seedOldClassifierDefaultBatch */
    INSERT INTO classifier_decision_batches (
      id, classifier_id, prompt_version_id, post_id, scope_category, input_sha256, completed_at
    ) VALUES (
      ${batchId}, ${fixture.classifierId}, ${fixture.promptVersionId}, ${fixture.postId},
      'global', ${Buffer.alloc(32, 1)}, ${at}
    )`)
  await query(sql`/* seedOldClassifierDefaultCall */
    INSERT INTO classifier_decision_calls (id, batch_id, shard_ordinal)
    VALUES (${callId}, ${batchId}, 0)`)
  await query(sql`/* seedOldClassifierDefaultCandidate */
    INSERT INTO classifier_decision_batch_candidates (
      batch_id, classifier_id, candidate_id, prompt_version_id, threshold_id,
      effective_lower_threshold, effective_upper_threshold
    ) VALUES (
      ${batchId}, ${fixture.classifierId}, ${fixture.topicCandidateId},
      ${fixture.promptVersionId}, ${fixture.topicThresholdId}, 0.25, 0.75
    )`)
  await query(sql`/* seedOldClassifierDefaultResult */
    INSERT INTO topic_classifier_results (
      topic_id, batch_id, decision_call_id, classifier_id, candidate_id, threshold_id,
      prompt_version_id, probability, effective_lower_threshold, effective_upper_threshold,
      raw_response, scope_category
    ) VALUES (
      ${fixture.topicId}, ${batchId}, ${callId}, ${fixture.classifierId},
      ${fixture.topicCandidateId}, ${fixture.topicThresholdId}, ${fixture.promptVersionId},
      0.8, 0.25, 0.75, '{"type":"noul","noul":0.8}'::jsonb, 'global'
    )`)
  await query.commit()
  return batchId
}

export async function readClassifierDefaultLineage(batchIds: readonly string[]): Promise<{
  results: number
  candidates: number
  calls: number
  batches: number
}> {
  const ids = [...batchIds]
  const { rows } = await write<{
    results: number
    candidates: number
    calls: number
    batches: number
  }>(sql`/* readClassifierDefaultLineage */ SELECT
    (SELECT count(*)::int FROM topic_classifier_results__default
      WHERE batch_id = ANY(${ids}::uuid[])) AS results,
    (SELECT count(*)::int FROM classifier_decision_batch_candidates__default
      WHERE batch_id = ANY(${ids}::uuid[])) AS candidates,
    (SELECT count(*)::int FROM classifier_decision_calls
      WHERE batch_id = ANY(${ids}::uuid[])) AS calls,
    (SELECT count(*)::int FROM classifier_decision_batches
      WHERE id = ANY(${ids}::uuid[])) AS batches`)
  return rows[0]!
}
