import sql from 'sql-template-strings'
import { beginTransaction, read } from '@data-stores/psql'
import type { ClassifierFixtureData } from './classifier-fixture-data.mts'

async function hasBlockedOperation(holderPid: number): Promise<boolean> {
  const { rows } = await read<{ blocked: boolean }>(sql`
    /* classifierFixtureHasBlockedOperation */
    SELECT EXISTS (
      SELECT 1 FROM pg_stat_activity
      WHERE ${holderPid} = ANY(pg_blocking_pids(pid))
    ) AS blocked
  `)
  return rows[0]!.blocked
}

export async function holdClassifierThresholdReplacement(data: ClassifierFixtureData) {
  const transaction = await beginTransaction()
  let settled = false
  const rollback = async () => {
    if (settled) return
    settled = true
    await transaction.rollback()
  }
  try {
    const { rows: pidRows } = await transaction<{ pid: number }>(sql`
      /* holdClassifierThresholdReplacement.pid */ SELECT pg_backend_pid() AS pid`)
    await transaction(sql`/* holdClassifierThresholdReplacement.deactivate */
      UPDATE classifier_candidate_thresholds
      SET deactivated_at = CURRENT_TIMESTAMP, deactivated_by_id = ${data.auditUserId}
      WHERE id = ${data.communityThresholdId}`)
    const { rows: thresholdRows } = await transaction<{ id: string }>(sql`
      /* holdClassifierThresholdReplacement.insert */
      INSERT INTO classifier_candidate_thresholds (
        classifier_id, candidate_id, prompt_version_id, lower_threshold_override
      ) VALUES (
        ${data.classifierId}, ${data.communityCandidateId}, ${data.promptVersionId}, 0.3500
      ) RETURNING id`)
    return {
      thresholdId: thresholdRows[0]!.id,
      release: async () => {
        if (settled) return
        await transaction.commit()
        settled = true
      },
      hasBlockedOperation: () => hasBlockedOperation(pidRows[0]!.pid),
      [Symbol.asyncDispose]: rollback,
    }
  } catch (error) {
    await rollback()
    throw error
  }
}

export async function holdClassifierTopicBatchCapture(data: ClassifierFixtureData) {
  const transaction = await beginTransaction()
  let settled = false
  const rollback = async () => {
    if (settled) return
    settled = true
    await transaction.rollback()
  }
  try {
    const { rows: pidRows } = await transaction<{ pid: number }>(sql`
      /* holdClassifierTopicBatchCapture.pid */ SELECT pg_backend_pid() AS pid`)
    const { rows: batchRows } = await transaction<{ id: string }>(sql`
      /* holdClassifierTopicBatchCapture.batch */
      INSERT INTO classifier_decision_batches (
        classifier_id, prompt_version_id, post_id, scope_category, scope_community_id
      ) VALUES (
        ${data.classifierId}, ${data.promptVersionId}, ${data.postId}, 'community_ai',
        ${data.communityId}
      ) RETURNING id`)
    const batchId = batchRows[0]!.id
    await transaction(sql`
      /* holdClassifierTopicBatchCapture.snapshot */
      INSERT INTO classifier_decision_batch_candidates (
        batch_id, classifier_id, candidate_id, prompt_version_id, threshold_id,
        effective_lower_threshold, effective_upper_threshold
      )
      SELECT ${batchId}, ${data.classifierId}, ${data.communityCandidateId},
        ${data.promptVersionId}, threshold.id,
        COALESCE(threshold.lower_threshold_override, prompt.default_lower_threshold),
        COALESCE(threshold.upper_threshold_override, prompt.default_upper_threshold)
      FROM classifier_prompt_versions prompt
      JOIN classifier_candidate_thresholds threshold
        ON threshold.prompt_version_id = prompt.id
        AND threshold.candidate_id = ${data.communityCandidateId}
        AND threshold.deactivated_at IS NULL
      WHERE prompt.id = ${data.promptVersionId}`)
    const { rows: callRows } = await transaction<{ id: string }>(sql`
      /* holdClassifierTopicBatchCapture.call */
      INSERT INTO classifier_decision_calls (batch_id, shard_ordinal)
      VALUES (${batchId}, 0) RETURNING id`)
    return {
      batchId,
      callId: callRows[0]!.id,
      release: async () => {
        if (settled) return
        await transaction.commit()
        settled = true
      },
      hasBlockedOperation: () => hasBlockedOperation(pidRows[0]!.pid),
      [Symbol.asyncDispose]: rollback,
    }
  } catch (error) {
    await rollback()
    throw error
  }
}
