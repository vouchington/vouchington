import { write } from '@data-stores/psql'

export async function getTopicMergeClassifierConfiguration(candidateIds: readonly string[]) {
  const { rows } = await write<{
    id: string
    topic_id: string
    thresholds: number
    overrides: number
    snapshots: number
  }>(
    `/* getTopicMergeClassifierConfiguration */
    SELECT c.id, c.topic_id,
      (SELECT count(*)::int FROM classifier_candidate_thresholds t WHERE t.candidate_id = c.id) AS thresholds,
      (SELECT count(*)::int FROM classifier_candidate_community_overrides o WHERE o.candidate_id = c.id) AS overrides,
      (SELECT count(*)::int FROM classifier_decision_batch_candidates b WHERE b.candidate_id = c.id) AS snapshots
    FROM classifier_candidates c WHERE c.id = ANY($1::uuid[]) ORDER BY c.id`,
    [candidateIds],
  )
  return rows
}

export async function getTopicMergeClassifierArtifacts(candidateId: string) {
  const { rows } = await write<{
    thresholds: number
    overrides: number
    snapshots: number
  }>(
    `/* getTopicMergeClassifierArtifacts */ SELECT
      (SELECT count(*)::int FROM classifier_candidate_thresholds WHERE candidate_id = $1::uuid) AS thresholds,
      (SELECT count(*)::int FROM classifier_candidate_community_overrides WHERE candidate_id = $1::uuid) AS overrides,
      (SELECT count(*)::int FROM classifier_decision_batch_candidates WHERE candidate_id = $1::uuid) AS snapshots`,
    [candidateId],
  )
  return rows[0]!
}

export async function changeTopicMergeClassifierCandidateTopic(
  candidateId: string,
  topicId: string,
) {
  await write(
    `/* changeTopicMergeClassifierCandidateTopic */
      UPDATE classifier_candidates SET topic_id = $2::uuid WHERE id = $1::uuid`,
    [candidateId, topicId],
  )
}

export async function seedTopicMergeClassifierCollision(
  classifierId: string,
  topicId: string,
  promptVersionId: string,
) {
  const { rows } = await write<{ id: string }>(
    `/* seedTopicMergeClassifierCollision */
    WITH candidate AS (INSERT INTO classifier_candidates (classifier_id, candidate_kind, topic_id)
      VALUES ($1::uuid, 'topic', $2::uuid) RETURNING id)
    INSERT INTO classifier_candidate_thresholds (classifier_id, candidate_id, prompt_version_id)
      SELECT $1::uuid, candidate.id, $3::uuid FROM candidate RETURNING candidate_id AS id`,
    [classifierId, topicId, promptVersionId],
  )
  return rows[0]!.id
}

export async function restoreTopicAfterClassifierDecision(topicId: string) {
  await write(
    `/* restoreTopicAfterClassifierDecision */ UPDATE topics SET deleted_at = NULL, deleted_by_id = NULL WHERE id = $1::uuid`,
    [topicId],
  )
}
