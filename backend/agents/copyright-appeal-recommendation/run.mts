import { createHash } from 'node:crypto'
import { callAgentModel } from '@agents/_shared'
import type { ModelSelection } from '@modules/model-providers/types'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { copyrightAppealRecommendations } from '@services/copyright-notices'
import {
  completeCopyrightAppealRecommendationRunFromExisting,
  isCopyrightAppealRecommendationRunActive,
  markCopyrightAppealRecommendationRunExpired,
} from '@services/copyright-notices/appeal-recommendation-runs'
import {
  callCopyrightAppealRecommendationModel,
  COPYRIGHT_APPEAL_PROMPT_VERSION,
  type CopyrightAppealRecommendationModelCaller,
} from './model.mts'

export type { CopyrightAppealRecommendationModelCaller } from './model.mts'

export async function runCopyrightAppealRecommendationAgent(
  submissionId: string,
  runId: string,
  selection: ModelSelection,
  callModel: CopyrightAppealRecommendationModelCaller = callCopyrightAppealRecommendationModel,
): Promise<'confirm' | 'modify' | 'reverse' | 'uncertain' | null> {
  if (!(await isCopyrightAppealRecommendationRunActive(runId))) return null
  if (
    await completeCopyrightAppealRecommendationRunFromExisting(
      runId,
      submissionId,
      COPYRIGHT_APPEAL_PROMPT_VERSION,
    )
  )
    return null
  const appeal = await copyrightAppealRecommendations.get(submissionId)
  if (!appeal) {
    await markCopyrightAppealRecommendationRunExpired(runId)
    return null
  }
  const input = wrapExternalContent(await sanitizePromptInjection(JSON.stringify(appeal)), {
    source: 'copyright_appeal',
    contentType: 'copyright-appeal',
  })
  const { output, model } = await callAgentModel({
    agentSlug: 'copyright-appeal-recommendation',
    selection,
    input,
    safetyIdentifier: createHash('sha256').update(submissionId).digest('hex'),
    callModel,
  })
  const { recommendation, rationale } = output
  const saved = await copyrightAppealRecommendations.append({
    submissionId,
    runId,
    inputSha256: createHash('sha256').update(input).digest(),
    promptVersion: COPYRIGHT_APPEAL_PROMPT_VERSION,
    model,
    recommendation,
    rationale,
  })
  // An erased input leaves no result; a run another worker already ended stays as it is.
  if (!saved) await markCopyrightAppealRecommendationRunExpired(runId)
  return recommendation
}
