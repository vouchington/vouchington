import sql from 'sql-template-strings'
import { beginTransaction, write } from '@data-stores/psql'
import type { ClassifierThresholdChangeResult } from '../../../services/classifiers/threshold-management-types.mts'
import { createTestTopic } from '../../entities/create-test-entities.mts'
import { createTestUser } from '../../entities/users.mts'
import { createClassifierFixture } from './classifiers.mts'

/** An activated classifier fixture, a staff actor and the scope of its global topic candidate. */
export async function createThresholdManagementCase() {
  const fixture = await createClassifierFixture()
  await fixture.activateClassifierConfigurations()
  const actor = await createTestUser()
  const scope = { classifierId: fixture.classifierId, candidateId: fixture.topicCandidateId }
  return { fixture, actor, scope }
}

/**
 * Adds `count` global topic candidates, each with its first threshold revision, to a classifier.
 * Call it before the classifier is activated. Returns the new candidate ids in listing order.
 */
export async function addGlobalTopicCandidates(
  fixture: { classifierId: string; promptVersionId: string },
  count: number,
): Promise<string[]> {
  const ids: string[] = []
  for (let index = 0; index < count; index++) {
    const topic = await createTestTopic({})
    const { rows } = await write<{ id: string }>(sql`/* addClassifierFixtureTopicCandidate */
      INSERT INTO classifier_candidates (classifier_id, candidate_kind, topic_id)
      VALUES (${fixture.classifierId}, 'topic', ${topic.id}) RETURNING id
    `)
    await write(sql`/* addClassifierFixtureTopicCandidateThreshold */
      INSERT INTO classifier_candidate_thresholds (classifier_id, candidate_id, prompt_version_id)
      VALUES (${fixture.classifierId}, ${rows[0]!.id}, ${fixture.promptVersionId})
    `)
    ids.push(rows[0]!.id)
  }
  return ids.toSorted()
}

/** The revision of an applied (changed or unchanged) result; any refusal fails the test. */
export function appliedThreshold(result: ClassifierThresholdChangeResult) {
  if (result.outcome !== 'changed' && result.outcome !== 'unchanged') {
    throw new Error(`expected an applied change, got ${result.outcome}`)
  }
  return result.threshold
}

export type ThresholdRowFact = {
  id: string
  promptVersionId: string
  lower: number | null
  upper: number | null
  active: boolean
  createdById: string | null
  deactivatedById: string | null
}

/** Every revision of a candidate, oldest first, with its raw overrides and audit actors. */
export async function readCandidateThresholdRows(candidateId: string): Promise<ThresholdRowFact[]> {
  const { rows } = await write<{
    id: string
    prompt_version_id: string
    lower: number | null
    upper: number | null
    active: boolean
    created_by_id: string | null
    deactivated_by_id: string | null
  }>(sql`/* readClassifierFixtureCandidateThresholdRows */
    SELECT id, prompt_version_id, lower_threshold_override::float8 AS lower,
      upper_threshold_override::float8 AS upper, (deactivated_at IS NULL) AS active,
      created_by_id, deactivated_by_id
    FROM classifier_candidate_thresholds
    WHERE candidate_id = ${candidateId}
    ORDER BY id
  `)
  return rows.map(row => ({
    id: row.id,
    promptVersionId: row.prompt_version_id,
    lower: row.lower,
    upper: row.upper,
    active: row.active,
    createdById: row.created_by_id,
    deactivatedById: row.deactivated_by_id,
  }))
}

/** The prompt version's immutable defaults, as stored. */
export async function readPromptVersionDefaults(promptVersionId: string) {
  const { rows } = await write<{ lower: number; upper: number; activated: boolean }>(sql`
    /* readClassifierFixturePromptVersionDefaults */
    SELECT default_lower_threshold::float8 AS lower, default_upper_threshold::float8 AS upper,
      (activated_at IS NOT NULL AND deactivated_at IS NULL) AS activated
    FROM classifier_prompt_versions WHERE id = ${promptVersionId}
  `)
  return rows[0]!
}

/**
 * Replaces the classifier's active prompt version with a new one (new defaults), as a prompt
 * rollout would. Returns the new prompt version id; the old revisions stay on the old version.
 */
export async function supersedeActivePromptVersion(
  classifierId: string,
  previousPromptVersionId: string,
  defaults: { lower: number; upper: number } = { lower: 0.2, upper: 0.8 },
): Promise<string> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* deactivateClassifierFixtureSupersededPrompt */
    UPDATE classifier_prompt_versions SET deactivated_at = CURRENT_TIMESTAMP
    WHERE id = ${previousPromptVersionId}
  `)
  const { rows } = await transaction<{ id: string }>(sql`
    /* activateClassifierFixtureReplacementPrompt */
    INSERT INTO classifier_prompt_versions (
      classifier_id, prompt, model_name, model_provider,
      default_lower_threshold, default_upper_threshold, activated_at
    ) VALUES (
      ${classifierId}, 'Classify the subject again.', 'typesafe/jev-1.14', 'typesafe',
      ${defaults.lower}, ${defaults.upper}, CURRENT_TIMESTAMP
    ) RETURNING id
  `)
  await transaction.commit()
  return rows[0]!.id
}

/** The effective thresholds a decision batch snapshotted for one candidate. */
export async function readBatchSnapshotThresholds(batchId: string, candidateId: string) {
  const { rows } = await write<{ lower: number; upper: number; threshold_id: string }>(sql`
    /* readClassifierFixtureBatchSnapshotThresholds */
    SELECT effective_lower_threshold::float8 AS lower, effective_upper_threshold::float8 AS upper,
      threshold_id
    FROM classifier_decision_batch_candidates
    WHERE batch_id = ${batchId} AND candidate_id = ${candidateId}
  `)
  return { lower: rows[0]!.lower, upper: rows[0]!.upper, thresholdId: rows[0]!.threshold_id }
}

/** A UUID that sorts immediately before `id`, so a keyset page starting there begins at `id`. */
export function uuidJustBefore(id: string): string {
  const hex = (BigInt(`0x${id.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
