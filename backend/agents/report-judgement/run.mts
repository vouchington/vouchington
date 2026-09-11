import {
  parseLLMJsonResponse,
  DEFAULT_AGENT_MODEL,
  callRecordingAgentResponseUsage,
} from '@agents/_shared'
import { extractTextFromOpenAIResponse } from '@modules/openai-utils'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import {
  getAllReportsForEntity,
  getReportJudgementContextForEntity,
  insertReportJudgement,
  shouldRefreshReportJudgementForEntity,
  type ModerationJudgementAction,
  type ModerationReportEntityType,
  type ModerationReportJudgement,
  type ReportJudgementContext,
} from '@services/moderation-reports'
import onError from '@modules/on-error'
import { fetchEntityContent, moderationAiConfig } from '@services/moderation'
import { callJudgementModel, type JudgementModelCaller } from './model.mts'

interface JudgementInput {
  entityType: ModerationReportEntityType
  entityId: string
  triggeringReportId: string
  rerunById?: string | null
}

export type { JudgementModelCaller } from './model.mts'

export interface JudgementAgentResult {
  judgement: ModerationReportJudgement
  communityId: string | null
  authorId: string | null
}

export async function runReportJudgementAgent(
  input: JudgementInput,
  callModel: JudgementModelCaller = callJudgementModel,
): Promise<JudgementAgentResult | null> {
  const { entityType, entityId, triggeringReportId, rerunById } = input

  const entityContent = await fetchEntityContent(entityType, entityId)
  if (!entityContent) {
    onError(
      new Error(`runReportJudgementAgent: entity not found or deleted: ${entityType}/${entityId}`),
    )
    return null
  }

  // Manual re-runs bypass the community AI gate so staff tools always return a result.
  if (
    entityContent.communityId &&
    !moderationAiConfig.getFields().community_judgement_enabled &&
    !rerunById
  )
    return null

  let context: ReportJudgementContext

  // Idempotency: automatic runs skip only when the latest judgement matches current context.
  // Manual re-runs (rerunById set) intentionally insert a fresh judgement.
  if (!rerunById) {
    const refreshState = await shouldRefreshReportJudgementForEntity(entityType, entityId)
    if (!refreshState.refresh) return null
    context = refreshState.context
  } else {
    context = await getReportJudgementContextForEntity(entityType, entityId)
  }

  const reports = await getAllReportsForEntity(entityType, entityId)

  const sanitizedContent = await sanitizePromptInjection(entityContent.text)
  const wrappedContent = wrapExternalContent(sanitizedContent, {
    source: 'user_content',
    contentType: entityType,
  })

  const sanitizedReports = await Promise.all(
    reports.map(async r => {
      if (!r.note) return `- Reason: ${r.reason}`
      const sanitizedNote = await sanitizePromptInjection(r.note)
      const wrappedNote = wrapExternalContent(sanitizedNote, {
        source: 'user_report',
        contentType: 'report_note',
      })
      return `- Reason: ${r.reason}, Note: ${wrappedNote}`
    }),
  )

  const reportSummary = sanitizedReports.join('\n')

  let communityRulesSection = ''
  if (entityContent.communityRules) {
    const sanitizedRules = await sanitizePromptInjection(entityContent.communityRules)
    const wrappedRules = wrapExternalContent(sanitizedRules, {
      source: 'community_rules',
      contentType: 'community-rules',
    })
    communityRulesSection = `\n\n## Community Rules\n${wrappedRules}`
  }

  const userInput = [
    `## Reported Content (type: ${entityType})`,
    wrappedContent,
    communityRulesSection,
    `\n## Reports (${reports.length} total)`,
    reportSummary || '(no reports found)',
  ]
    .filter(Boolean)
    .join('\n')

  const safetyIdentifier = entityContent.authorId ?? entityId
  // Record from what was actually spent (both on success and on a failed/incomplete response,
  // which still billed tokens), independent of whether the response below parses — a malformed
  // response still billed real tokens, and extractTextFromOpenAIResponse throws on a
  // completed-but-unextractable response (e.g. a refusal item), which must not skip recording.
  // postId is set for 'post' and 'comment' — both are rows in `posts` (see fetch-entity.mts's
  // combined post-or-comment query) — but not for 'user', 'url_hostname', or 'rss_feed_item',
  // which don't reference a row in `posts`, and ai_usage_records.post_id has a real FK to it.
  const response = await callRecordingAgentResponseUsage(
    () => callModel(userInput, safetyIdentifier),
    {
      agentSlug: 'report-judgement',
      communityId: entityContent.communityId,
      postId: entityType === 'post' || entityType === 'comment' ? entityId : undefined,
    },
  )

  const text = extractTextFromOpenAIResponse(response)

  const parsed = parseLLMJsonResponse<{
    recommended_action: string
    public_response: string
    internal_response: string
  }>(text)

  const validActions = new Set<string>(['no_action', 'warn', 'remove', 'escalate'])
  if (
    !parsed ||
    !validActions.has(parsed.recommended_action) ||
    typeof parsed.public_response !== 'string' ||
    typeof parsed.internal_response !== 'string'
  ) {
    throw new TypeError(`runReportJudgementAgent: invalid response shape: ${text}`)
  }

  const judgement = await insertReportJudgement({
    entityType,
    entityId,
    triggeringReportId,
    rerunById: rerunById ?? null,
    recommendedAction: parsed.recommended_action as ModerationJudgementAction,
    publicResponse: parsed.public_response,
    internalResponse: parsed.internal_response,
    model: DEFAULT_AGENT_MODEL,
    context,
  })

  return { judgement, communityId: entityContent.communityId, authorId: entityContent.authorId }
}
