import { createHash } from 'node:crypto'
import { write, type QueryExecutor } from '@data-stores/psql'
import type { ResolvedClassifierRun } from '@services/classifier-runs'
import { getModerationSystemUserId } from '@services/users/system-users'
import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'
import type { ClassifierModelProvider } from '@voucha/types'
import sql from 'sql-template-strings'
import { getActiveCommunityModerationClassifier } from './active-community-moderation-classifier.mts'
import { getCommunityModerationPageSize } from './config.mts'
import {
  getActiveCommunityAgentPromptPage,
  type ActiveCommunityAgentPromptCursor,
} from './get-active-prompts.mts'

const MAX_COMMUNITY_MODERATION_QUESTIONS = 30
const MAX_COMMUNITY_MODERATION_RULE_CHARACTERS = 40_000

type CommunityModerationPrompt = { id: string; text: string }

/** One durable page of a post's moderation traversal. Each page pins its exact provider input. */
export type CommunityModerationRunConfiguration = {
  revision: 2
  actorId: string
  communityId: string
  classifierId: string
  promptVersionId: string
  prompt: string
  modelName: string
  modelProvider: ClassifierModelProvider
  afterCursor: ActiveCommunityAgentPromptCursor | null
  endCursor: ActiveCommunityAgentPromptCursor | null
  nextCursor: ActiveCommunityAgentPromptCursor | null
  prompts: readonly CommunityModerationPrompt[]
}

/**
 * Selects a nonempty prefix fitting one provider call. Creation limits every stored prompt to
 * 10,000 characters, but a directly written oversized first rule is still attempted
 * alone instead of being silently skipped.
 */
function selectCommunityModerationPrompts(
  prompts: readonly CommunityModerationPrompt[],
): CommunityModerationPrompt[] {
  const selected: CommunityModerationPrompt[] = []
  let ruleCharacters = 0
  for (const prompt of prompts) {
    if (
      selected.length === MAX_COMMUNITY_MODERATION_QUESTIONS ||
      (selected.length > 0 &&
        ruleCharacters + prompt.text.length > MAX_COMMUNITY_MODERATION_RULE_CHARACTERS)
    ) {
      break
    }
    selected.push({ id: prompt.id, text: prompt.text })
    ruleCharacters += prompt.text.length
  }
  return selected
}

type RequestProgress = {
  id: string
  community_prompt_cursor_activated_at: string | null
  community_prompt_cursor_prompt_id: string | null
  community_prompt_end_cursor_activated_at: string | null
  community_prompt_end_cursor_prompt_id: string | null
}

/** The progress row is unique by classifier, post and content digest. */
async function readCommunityModerationProgress(
  query: QueryExecutor,
  communityId: string,
  postId: string,
  inputSha256: Buffer,
): Promise<{
  afterCursor: ActiveCommunityAgentPromptCursor | null
  endCursor: ActiveCommunityAgentPromptCursor | null
}> {
  const { rows } = await query<RequestProgress>(sql`
    /* readCommunityModerationProgress */
    SELECT request.id,
      to_char(request.community_prompt_cursor_activated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS community_prompt_cursor_activated_at,
      request.community_prompt_cursor_prompt_id,
      to_char(request.community_prompt_end_cursor_activated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS community_prompt_end_cursor_activated_at,
      request.community_prompt_end_cursor_prompt_id
    FROM classifier_run_requests request
    JOIN classifiers classifier ON classifier.id = request.classifier_id
    WHERE classifier.slug = ${COMMUNITY_MODERATION_CLASSIFIER_SLUG}
      AND request.post_id = ${postId} AND request.input_sha256 = ${inputSha256}
    LIMIT 1
  `)
  const request = rows[0]
  if (!request) return { afterCursor: null, endCursor: null }
  const cursor = (activatedAt: string | null, id: string | null) =>
    activatedAt && id ? { activatedAt, id } : null
  const afterCursor = cursor(
    request.community_prompt_cursor_activated_at,
    request.community_prompt_cursor_prompt_id,
  )
  const pinnedEndCursor = cursor(
    request.community_prompt_end_cursor_activated_at,
    request.community_prompt_end_cursor_prompt_id,
  )
  if (pinnedEndCursor) return { afterCursor, endCursor: pinnedEndCursor }
  const { rows: latest } = await query<{ activated_at_cursor: string; id: string }>(sql`
    /* readCommunityModerationEndCursor */
    SELECT to_char(activated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      AS activated_at_cursor, id
    FROM community_agent_prompts
    WHERE community_id = ${communityId}
      AND is_slot_allocated = true
      AND activated_at IS NOT NULL
      AND deactivated_at IS NULL
      AND deleted_at IS NULL
    ORDER BY activated_at DESC, id DESC
    LIMIT 1
  `)
  const last = latest[0]
  if (!last) return { afterCursor, endCursor: null }
  const endCursor = { activatedAt: last.activated_at_cursor, id: last.id }
  await query(sql`
    /* pinCommunityModerationEndCursor */
    UPDATE classifier_run_requests
    SET community_prompt_end_cursor_activated_at = ${endCursor.activatedAt}::timestamptz,
      community_prompt_end_cursor_prompt_id = ${endCursor.id}::uuid
    WHERE id = ${request.id} AND community_prompt_end_cursor_activated_at IS NULL
  `)
  return { afterCursor, endCursor }
}

/**
 * Resolves one bounded candidate page. A page with no eligible prompts can still be a local-only
 * run: completing it advances the durable cursor, so a later eligible prompt is never hidden by
 * an ineligible stretch. A page's hash includes its cursor and exact prompt text for replay.
 */
export async function resolveCommunityModerationRunConfiguration(
  communityId: string,
  query: QueryExecutor = write,
  subject?: { postId: string; inputSha256: Buffer },
): Promise<ResolvedClassifierRun<CommunityModerationRunConfiguration> | null> {
  const { afterCursor, endCursor } = subject
    ? await readCommunityModerationProgress(query, communityId, subject.postId, subject.inputSha256)
    : { afterCursor: null, endCursor: null }
  if (subject && endCursor === null) return null
  const page = await getActiveCommunityAgentPromptPage(
    communityId,
    afterCursor,
    getCommunityModerationPageSize(),
    query,
    endCursor,
  )
  const selected = selectCommunityModerationPrompts(
    page.items.map(row => ({ id: row.id, text: row.prompt })),
  )
  if (selected.length === 0 && page.next === null && afterCursor === null) return null
  const lastSelected = page.items[selected.length - 1]
  const nextCursor =
    selected.length < page.items.length && lastSelected
      ? { activatedAt: lastSelected.activation_cursor, id: lastSelected.id }
      : page.next
  const classifier = await getActiveCommunityModerationClassifier(query)
  const actorId = await getModerationSystemUserId()
  const prompts = selected.toSorted((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  )
  const configuration: CommunityModerationRunConfiguration = {
    revision: 2,
    actorId,
    communityId,
    classifierId: classifier.classifierId,
    promptVersionId: classifier.promptVersionId,
    prompt: classifier.prompt,
    modelName: classifier.modelName,
    modelProvider: classifier.modelProvider,
    afterCursor,
    endCursor,
    nextCursor,
    prompts,
  }
  const { rows } = await query<{ configuration_json: string }>(sql`
    /* canonicalizeCommunityModerationRunConfiguration */
    SELECT ${JSON.stringify(configuration)}::jsonb::text AS configuration_json
  `)
  const configurationJson = rows[0]!.configuration_json
  return {
    configuration,
    configurationJson,
    configurationSha256: createHash('sha256').update(configurationJson).digest(),
    actorId,
    remote:
      prompts.length === 0
        ? null
        : {
            classifierId: configuration.classifierId,
            promptVersionId: configuration.promptVersionId,
            scope: { scopeCategory: 'community_ai', scopeCommunityId: communityId },
            candidateKind: 'community_prompt',
            promptIds: prompts.map(prompt => prompt.id),
          },
  }
}
