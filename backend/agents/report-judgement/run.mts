import { callAgentModel } from '@agents/_shared'
import type { ModelSelection } from '@modules/model-providers/types'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import {
  getAllReportsForEntity,
  getReportJudgementContextForEntity,
  insertReportJudgement,
  getJudgementByRunId,
  hasAutomaticJudgementForReport,
  shouldRefreshReportJudgementForEntity,
  type ModerationReportEntityType,
  type ModerationReportJudgement,
  type ReportJudgementContext,
} from '@services/moderation-reports'
import onError from '@modules/on-error'
import { fetchEntityContent } from '@services/moderation'
import { moderationAiConfig } from '@services/moderation-ai-config'
import { withPrimaryReads } from '@services/moderation-reports/primary-reads'
import { callJudgementModel, type JudgementModelCaller } from './model.mts'

interface JudgementInput {
  entityType: ModerationReportEntityType
  entityId: string
  triggeringReportId: string
  rerunById?: string | null
  runId?: string | null
}

export type { JudgementModelCaller } from './model.mts'

export interface JudgementAgentResult {
  judgement: ModerationReportJudgement
  communityId: string | null
  authorId: string | null
}

export async function runReportJudgementAgent(
  input: JudgementInput,
  selection: ModelSelection,
  callModel: JudgementModelCaller = callJudgementModel,
): Promise<JudgementAgentResult | null> {
  const { entityType, entityId, triggeringReportId, rerunById, runId } = input

  if (runId) {
    const existing = await withPrimaryReads(() => getJudgementByRunId(runId))
    if (existing) {
      if (
        existing.entity_type !== entityType ||
        existing.entity_id !== entityId ||
        existing.triggering_report_id !== triggeringReportId ||
        existing.rerun_by_id !== rerunById
      )
        throw new Error('Judgement run identity belongs to another request')
      return { judgement: existing, communityId: null, authorId: null }
    }
  }

  // Cheap start-of-job check on the primary: this report's automatic judgement is already stored,
  // so a duplicate delivery makes no second provider request.
  if (
    !rerunById &&
    (await withPrimaryReads(() => hasAutomaticJudgementForReport(triggeringReportId)))
  )
    return null

  const loadCurrentInput = async (): Promise<{
    entityContent: NonNullable<Awaited<ReturnType<typeof fetchEntityContent>>>
    context: ReportJudgementContext
    reports: Awaited<ReturnType<typeof getAllReportsForEntity>>
  } | null> => {
    const entityContent = await fetchEntityContent(entityType, entityId)
    if (!entityContent) {
      onError(
        new Error(
          `runReportJudgementAgent: entity not found or deleted: ${entityType}/${entityId}`,
        ),
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
    // Automatic runs skip only when the latest judgement matches current context.
    const context = rerunById
      ? await getReportJudgementContextForEntity(entityType, entityId)
      : await shouldRefreshReportJudgementForEntity(entityType, entityId).then(state =>
          state.refresh ? state.context : null,
        )
    if (!context) return null
    const reports = await getAllReportsForEntity(entityType, entityId)
    return { entityContent, context, reports }
  }
  // Scope only the reads: paid model I/O and the conditional write run after the primary read scope.
  const current = rerunById ? await withPrimaryReads(loadCurrentInput) : await loadCurrentInput()
  if (!current) return null
  const { entityContent, context, reports } = current

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
  // Usage is recorded from what was actually spent: on success, and for a billed answer that
  // failed validation or did not complete, which still billed tokens. postId is set for 'post' and
  // 'comment' -- both are rows in `posts` (see fetch-entity.mts's combined post-or-comment query)
  // -- but not for 'user', 'url_hostname', or 'rss_feed_item', which don't reference a row in
  // `posts`, and ai_usage_records.post_id has a real FK to it.
  const result = await callAgentModel({
    agentSlug: 'report-judgement',
    selection,
    input: userInput,
    safetyIdentifier,
    callModel,
    communityId: entityContent.communityId,
    postId: entityType === 'post' || entityType === 'comment' ? entityId : undefined,
  })

  const judgement = await insertReportJudgement({
    entityType,
    entityId,
    triggeringReportId,
    rerunById: rerunById ?? null,
    runId: runId ?? null,
    recommendedAction: result.output.recommended_action,
    publicResponse: result.output.public_response,
    internalResponse: result.output.internal_response,
    model: result.model,
    context,
  })

  return { judgement, communityId: entityContent.communityId, authorId: entityContent.authorId }
}
