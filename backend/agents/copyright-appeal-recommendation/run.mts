import { createHash } from 'node:crypto'
import { callReceiptedAgentModel } from '@agents/_shared'
import type { ModelSelection } from '@modules/model-providers/types'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { copyrightAppealRecommendations } from '@services/copyright-notices'
import {
  callCopyrightAppealRecommendationModel,
  COPYRIGHT_APPEAL_PROMPT_VERSION,
  type CopyrightAppealRecommendationModelCaller,
} from './model.mts'

export type { CopyrightAppealRecommendationModelCaller } from './model.mts'

export async function runCopyrightAppealRecommendationAgent(
  submissionId: string,
  selection: ModelSelection,
  callModel: CopyrightAppealRecommendationModelCaller = callCopyrightAppealRecommendationModel,
  operationId = submissionId,
): Promise<'confirm' | 'modify' | 'reverse' | 'uncertain' | null> {
  const appeal = await copyrightAppealRecommendations.get(submissionId)
  if (!appeal) return null
  const input = wrapExternalContent(await sanitizePromptInjection(JSON.stringify(appeal)), {
    source: 'copyright_appeal',
    contentType: 'copyright-appeal',
  })
  const { output, model } = await callReceiptedAgentModel({
    agentSlug: 'copyright-appeal-recommendation',
    promptVersion: COPYRIGHT_APPEAL_PROMPT_VERSION,
    operationId,
    copyrightNoticeSubmissionId: submissionId,
    selection,
    input,
    safetyIdentifier: createHash('sha256').update(submissionId).digest('hex'),
    callModel,
  })
  const { recommendation, rationale } = output
  await copyrightAppealRecommendations.append({
    submissionId,
    inputSha256: createHash('sha256').update(input).digest(),
    promptVersion: COPYRIGHT_APPEAL_PROMPT_VERSION,
    model,
    recommendation,
    rationale,
  })
  return recommendation
}
