import { createHash } from 'node:crypto'
import type { QueryExecutor } from '@data-stores/psql'
import {
  POST_CLASSIFIER_ACTION_POLICY_REVISION,
  POST_CLASSIFIER_LABELS,
  POST_CLASSIFIER_LOCAL_POLICY_REVISION,
  POST_CLASSIFIER_MODEL_NAME,
  POST_CLASSIFIER_MODEL_PROVIDER,
  POST_CLASSIFIER_PROMPT,
  POST_CLASSIFIER_REMOTE_QUESTIONS,
} from '@voucha/types/entities/post-classifier'
import { isBaselineModeratorSlug } from '@voucha/types/entities/moderator-configs'
import { getFreshAiGeneratedConfidenceThreshold } from '@services/moderation/config'
import {
  getCurrentPostClassifierActorId,
  getCurrentPostClassifierLabelToggles,
  getCurrentPostClassifierLocalTopicId,
  getCurrentPostClassifierRemoteRows,
  type CurrentPostClassifierRemoteRow,
} from './configuration-data.mts'

function checkedRemoteRows(
  requestedTopicSlugs: readonly string[],
  rows: CurrentPostClassifierRemoteRow[],
): Map<string, CurrentPostClassifierRemoteRow> {
  const bySlug = new Map(rows.map(row => [row.topic_slug, row]))
  if (rows.length !== requestedTopicSlugs.length || bySlug.size !== requestedTopicSlugs.length) {
    throw new Error('post classifier candidate or threshold is missing or duplicated')
  }
  const first = rows[0]!
  if (
    first.prompt !== POST_CLASSIFIER_PROMPT ||
    first.model_name !== POST_CLASSIFIER_MODEL_NAME ||
    first.model_provider !== POST_CLASSIFIER_MODEL_PROVIDER
  ) {
    throw new Error('post classifier active prompt does not match the fixed catalog')
  }
  if (
    rows.some(
      row =>
        row.classifier_id !== first.classifier_id ||
        row.prompt_version_id !== first.prompt_version_id ||
        row.prompt !== first.prompt ||
        row.model_name !== first.model_name ||
        row.model_provider !== first.model_provider,
    )
  ) {
    throw new Error('post classifier prompt changed while resolving candidates')
  }
  return bySlug
}

export async function resolvePostClassifierConfiguration(
  communityId: string | null,
  options: { detectorPackageVersion: string; query?: QueryExecutor },
) {
  if (!options.detectorPackageVersion) throw new Error('Detector package version is required')
  const toggles = await getCurrentPostClassifierLabelToggles(communityId, options.query)
  const toggleBySlug = new Map(toggles.map(row => [row.slug, row]))
  const enabledLabels = POST_CLASSIFIER_LABELS.flatMap(label => {
    const toggle = toggleBySlug.get(label.slug)
    const enabled = isBaselineModeratorSlug(label.slug)
      ? toggle?.disabled_at === null || !toggle
      : toggle?.enabled_at != null && toggle.disabled_at === null
    return enabled ? [{ slug: label.slug, kind: label.kind }] : []
  })
  if (enabledLabels.length === 0) return null

  const actorId = await getCurrentPostClassifierActorId(options.query)
  const localEnabled = enabledLabels.some(label => label.kind === 'local')
  const localTopicSlug = POST_CLASSIFIER_LABELS.find(label => label.kind === 'local')!.topicSlug
  const remoteSlugs = new Set(
    enabledLabels.flatMap(label => (label.kind === 'remote' ? [label.slug] : [])),
  )
  const remoteQuestions = POST_CLASSIFIER_REMOTE_QUESTIONS.filter(question =>
    remoteSlugs.has(question.logicalSlug),
  )
  const local = localEnabled
    ? {
        detector: '@jongleberry/vurst-ai',
        detectorPackageVersion: options.detectorPackageVersion,
        policyRevision: POST_CLASSIFIER_LOCAL_POLICY_REVISION,
        topicSlug: localTopicSlug,
        topicId: await getCurrentPostClassifierLocalTopicId(localTopicSlug, options.query),
        confidenceThreshold: Math.fround(await getFreshAiGeneratedConfidenceThreshold()),
      }
    : null
  let remote = null
  if (remoteQuestions.length > 0) {
    const rows = await getCurrentPostClassifierRemoteRows(
      remoteQuestions.map(question => question.topicSlug),
      options.query,
    )
    const bySlug = checkedRemoteRows(
      remoteQuestions.map(question => question.topicSlug),
      rows,
    )
    const first = rows[0]!
    remote = {
      classifierId: first.classifier_id,
      promptVersionId: first.prompt_version_id,
      prompt: first.prompt,
      modelName: first.model_name,
      modelProvider: first.model_provider,
      questions: remoteQuestions.map(question => {
        const row = bySlug.get(question.topicSlug)!
        return {
          logicalSlug: question.logicalSlug,
          questionId: question.questionId,
          question: question.question,
          topicSlug: question.topicSlug,
          topicId: row.topic_id,
          candidateId: row.candidate_id,
          thresholdId: row.threshold_id,
          lower: row.lower,
          upper: row.upper,
        }
      }),
    }
  }
  const configuration = {
    revision: 1,
    actorId,
    detectorPackageVersion: options.detectorPackageVersion,
    actionPolicyRevision: POST_CLASSIFIER_ACTION_POLICY_REVISION,
    enabledLabels,
    local,
    remote,
  }
  const configurationJson = JSON.stringify(configuration)
  const configurationSha256 = createHash('sha256').update(configurationJson).digest()
  return { configuration, configurationJson, configurationSha256 }
}
