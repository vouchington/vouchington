import {
  agentCallOperationKey,
  agentCallRequestSha256,
  callReceiptedAgentModel,
  unrecoverable,
} from '@agents/_shared'
import type { ModelSelection } from '@modules/model-providers/types'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import {
  getAllReportsForEntity,
  getReportJudgementContextForEntity,
  insertReportJudgement,
  getJudgementByRunId,
  getJudgementByOperationKey,
  shouldRefreshReportJudgementForEntity,
  type ModerationReportEntityType,
  type ModerationReportJudgement,
  type ReportJudgementContext,
} from '@services/moderation-reports'
import onError from '@modules/on-error'
import { fetchEntityContent } from '@services/moderation'
import { moderationAiConfig } from '@services/moderation-ai-config'
import { withPrimaryReads } from '@services/moderation-reports/primary-reads'
import {
  callJudgementModel,
  REPORT_JUDGEMENT_PROMPT_VERSION,
  type JudgementModelCaller,
} from './model.mts'
import {
  assertReportJudgementReplayIdentity,
  reportJudgementIdentitySha256,
} from './replay-identity.mts'

interface JudgementInput {
  entityType: ModerationReportEntityType
  entityId: string
  triggeringReportId: string
  rerunById?: string | null
  runId?: string | null
  operationId?: string
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
  const operationId =
    input.operationId ?? `${entityType}:${entityId}:${triggeringReportId}:${rerunById ?? ''}`
  const operationKey = agentCallOperationKey('report-judgement', operationId)
  const identity = { entityType, entityId, triggeringReportId, rerunById, runId, operationId }
  const identitySha256 = reportJudgementIdentitySha256(identity)
  const replay = await withPrimaryReads(() => getJudgementByOperationKey(operationKey))
  const runReplay = runId ? await withPrimaryReads(() => getJudgementByRunId(runId)) : null
  if (runReplay && runReplay.id !== replay?.id) {
    throw new Error('Judgement run identity belongs to another paid operation')
  }
  if (replay) assertReportJudgementReplayIdentity(replay, identity, identitySha256)

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
      !rerunById &&
      !replay
    )
      return null
    // Automatic runs skip only when the latest judgement matches current context.
    const context =
      rerunById || replay
        ? await getReportJudgementContextForEntity(entityType, entityId)
        : await shouldRefreshReportJudgementForEntity(entityType, entityId).then(state =>
            state.refresh ? state.context : null,
          )
    if (!context) return null
    const reports = await getAllReportsForEntity(entityType, entityId)
    return { entityContent, context, reports }
  }
  // Scope only the reads: paid model I/O and the conditional write run after the primary read scope.
  const current =
    rerunById || replay ? await withPrimaryReads(loadCurrentInput) : await loadCurrentInput()
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

  const requestSha256 = agentCallRequestSha256(
    selection,
    REPORT_JUDGEMENT_PROMPT_VERSION,
    userInput,
  )
  if (replay) {
    if (replay.agent_call_request_sha256 !== requestSha256) {
      unrecoverable(
        new Error(`Paid report-judgement call ${operationKey} request changed after reservation`),
      )
    }
    return {
      judgement: replay,
      communityId: replay.agent_call_community_id ?? null,
      authorId: entityContent.authorId,
    }
  }

  const safetyIdentifier = entityContent.authorId ?? entityId
  // Bill actual provider usage, including billed validation failures. Comments are posts;
  // other report targets do not have the post FK required by ai_usage_records.
  const result = await callReceiptedAgentModel({
    agentSlug: 'report-judgement',
    reportTarget: { entityType, entityId },
    promptVersion: REPORT_JUDGEMENT_PROMPT_VERSION,
    operationId,
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
    agentCallOperationKey: operationKey,
    agentCallRequestSha256: requestSha256,
    agentCallIdentitySha256: identitySha256,
    agentCallCommunityId: entityContent.communityId,
    recommendedAction: result.output.recommended_action,
    publicResponse: result.output.public_response,
    internalResponse: result.output.internal_response,
    model: result.model,
    context,
  })

  return { judgement, communityId: entityContent.communityId, authorId: entityContent.authorId }
}
