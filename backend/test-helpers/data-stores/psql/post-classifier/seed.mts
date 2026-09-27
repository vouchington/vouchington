import { write } from '@data-stores/psql'
import { POST_CLASSIFIER_REMOTE_QUESTIONS } from '@voucha/types/entities/post-classifier'
import sql from 'sql-template-strings'

type CandidateRow = {
  candidate_id: string
  topic_slug: string
  threshold_id: string
  lower: number
  upper: number
}

export async function getPostClassifierSeedState() {
  const { rows: promptRows } = await write<{
    classifier_slug: string
    prompt_id: string
    prompt: string
    model_name: string
    activated_at: Date | null
    deactivated_at: Date | null
    deleted_at: Date | null
  }>(sql`/* getPostClassifierSeedPromptState */
    SELECT classifier.slug AS classifier_slug, prompt.id AS prompt_id,
      prompt.prompt, prompt.model_name, prompt.activated_at,
      prompt.deactivated_at, prompt.deleted_at
    FROM classifiers classifier
    JOIN classifier_prompt_versions prompt ON prompt.classifier_id = classifier.id
    WHERE classifier.slug = 'post-classifier'
    ORDER BY prompt.id
  `)
  const { rows: candidateRows } = await write<CandidateRow>(sql`
    /* getPostClassifierSeedCandidateState */
    SELECT candidate.id AS candidate_id, topic.slug AS topic_slug,
      threshold.id AS threshold_id,
      COALESCE(threshold.lower_threshold_override, prompt.default_lower_threshold)::float8 AS lower,
      COALESCE(threshold.upper_threshold_override, prompt.default_upper_threshold)::float8 AS upper
    FROM classifiers classifier
    JOIN classifier_prompt_versions prompt ON prompt.classifier_id = classifier.id
      AND prompt.activated_at IS NOT NULL AND prompt.deactivated_at IS NULL
      AND prompt.deleted_at IS NULL
    JOIN classifier_candidates candidate ON candidate.classifier_id = classifier.id
      AND candidate.deleted_at IS NULL AND candidate.community_id IS NULL
    JOIN topics topic ON topic.id = candidate.topic_id
    JOIN classifier_candidate_thresholds threshold ON threshold.candidate_id = candidate.id
      AND threshold.prompt_version_id = prompt.id AND threshold.deactivated_at IS NULL
    WHERE classifier.slug = 'post-classifier'
  `)
  const order: string[] = POST_CLASSIFIER_REMOTE_QUESTIONS.map(question => question.topicSlug)
  const active = promptRows.filter(
    row => row.activated_at !== null && row.deactivated_at === null && row.deleted_at === null,
  )
  return {
    classifierSlug: promptRows[0]?.classifier_slug ?? null,
    activePromptIds: active.map(row => row.prompt_id),
    historicPromptIds: promptRows
      .filter(row => row.deactivated_at !== null)
      .map(row => row.prompt_id),
    prompt: active[0]?.prompt ?? null,
    modelName: active[0]?.model_name ?? null,
    candidates: candidateRows
      .sort((a, b) => order.indexOf(a.topic_slug) - order.indexOf(b.topic_slug))
      .map(row => ({
        candidateId: row.candidate_id,
        topicSlug: row.topic_slug,
        thresholdId: row.threshold_id,
        lower: row.lower,
        upper: row.upper,
      })),
  }
}

export async function replacePostClassifierThreshold(
  candidateId: string,
  promptVersionId: string,
  lower: number,
  upper: number,
): Promise<void> {
  await write(sql`/* deactivatePostClassifierThresholdForTest */
    UPDATE classifier_candidate_thresholds
    SET deactivated_at = CURRENT_TIMESTAMP
    WHERE candidate_id = ${candidateId} AND prompt_version_id = ${promptVersionId}
      AND deactivated_at IS NULL
  `)
  await write(sql`/* insertPostClassifierThresholdForTest */
    INSERT INTO classifier_candidate_thresholds (
      classifier_id, candidate_id, prompt_version_id,
      lower_threshold_override, upper_threshold_override
    )
    SELECT candidate.classifier_id, candidate.id, ${promptVersionId}, ${lower}, ${upper}
    FROM classifier_candidates candidate WHERE candidate.id = ${candidateId}
  `)
}

export async function rotatePostClassifierPrompt(
  nextPrompt: string,
  modelName = 'typesafe/jev-1.13',
): Promise<void> {
  await write(sql`/* deactivatePostClassifierPromptForTest */
    UPDATE classifier_prompt_versions SET deactivated_at = CURRENT_TIMESTAMP
    WHERE classifier_id = (SELECT id FROM classifiers WHERE slug = 'post-classifier')
      AND activated_at IS NOT NULL AND deactivated_at IS NULL AND deleted_at IS NULL
  `)
  await write(sql`/* rotatePostClassifierPromptForTest */
    INSERT INTO classifier_prompt_versions (
      classifier_id, prompt, model_name, model_provider,
      default_lower_threshold, default_upper_threshold, activated_at
    )
    SELECT classifier.id, ${nextPrompt}, ${modelName}, 'openrouter',
      0.2500, 0.7500, CURRENT_TIMESTAMP
    FROM classifiers classifier WHERE classifier.slug = 'post-classifier'
  `)
  await write(sql`/* bindPostClassifierTestPromptThresholds */
    INSERT INTO classifier_candidate_thresholds (
      classifier_id, candidate_id, prompt_version_id,
      lower_threshold_override, upper_threshold_override
    )
    SELECT classifier.id, candidate.id, prompt.id, 0.2500, 0.7500
    FROM classifiers classifier
    JOIN classifier_prompt_versions prompt ON prompt.classifier_id = classifier.id
      AND prompt.activated_at IS NOT NULL AND prompt.deactivated_at IS NULL
    JOIN classifier_candidates candidate ON candidate.classifier_id = classifier.id
      AND candidate.deleted_at IS NULL
    WHERE classifier.slug = 'post-classifier'
  `)
}

export async function setPostClassifierCandidateDeletedForTest(
  candidateId: string,
  deleted: boolean,
): Promise<void> {
  await write(sql`/* setPostClassifierCandidateDeletedForTest */
    UPDATE classifier_candidates SET deleted_at = CASE WHEN ${deleted} THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE id = ${candidateId}
  `)
}

export async function setPostClassifierLocalTopicDeletedForTest(deleted: boolean): Promise<void> {
  await write(sql`/* setPostClassifierLocalTopicDeletedForTest */
    UPDATE topics SET deleted_at = CASE WHEN ${deleted} THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE slug = 'ai-generated'
  `)
}
