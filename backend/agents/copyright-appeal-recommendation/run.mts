import { createHash } from 'node:crypto'
import {
  callRecordingAgentResponseUsage,
  DEFAULT_AGENT_MODEL,
  parseLLMJsonResponse,
} from '@agents/_shared'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { extractTextFromOpenAIResponse } from '@modules/openai-utils'
import { copyrightAppealRecommendations } from '@services/copyright-notices'
import {
  callCopyrightAppealRecommendationModel,
  type CopyrightAppealRecommendationModelCaller,
} from './model.mts'

const PROMPT_VERSION = 'copyright-appeal-v1'

export type { CopyrightAppealRecommendationModelCaller } from './model.mts'

export async function runCopyrightAppealRecommendationAgent(
  submissionId: string,
  callModel: CopyrightAppealRecommendationModelCaller = callCopyrightAppealRecommendationModel,
): Promise<'confirm' | 'modify' | 'reverse' | 'uncertain' | null> {
  const appeal = await copyrightAppealRecommendations.get(submissionId)
  if (!appeal) return null
  const input = wrapExternalContent(await sanitizePromptInjection(JSON.stringify(appeal)), {
    source: 'copyright_appeal',
    contentType: 'copyright-appeal',
  })
  const response = await callRecordingAgentResponseUsage(
    () => callModel(input, createHash('sha256').update(submissionId).digest('hex')),
    { agentSlug: 'copyright-appeal-recommendation' },
  )
  const { recommendation, rationale } = parseCopyrightAppealRecommendationOutput(
    extractTextFromOpenAIResponse(response),
  )
  await copyrightAppealRecommendations.append({
    submissionId,
    inputSha256: createHash('sha256').update(input).digest(),
    promptVersion: PROMPT_VERSION,
    model: DEFAULT_AGENT_MODEL,
    recommendation,
    rationale,
  })
  return recommendation
}

export function parseCopyrightAppealRecommendationOutput(text: string): {
  recommendation: 'confirm' | 'modify' | 'reverse' | 'uncertain'
  rationale: string
} {
  let output: { recommendation?: unknown; rationale?: unknown } | null
  try {
    output = parseLLMJsonResponse<{ recommendation?: unknown; rationale?: unknown }>(text)
  } catch {
    throw new TypeError('Invalid copyright appeal recommendation JSON')
  }
  const recommendation = output?.recommendation
  const rationale = output?.rationale
  if (
    (recommendation !== 'confirm' &&
      recommendation !== 'modify' &&
      recommendation !== 'reverse' &&
      recommendation !== 'uncertain') ||
    typeof rationale !== 'string' ||
    rationale.length > 10_000
  )
    throw new TypeError('Invalid copyright appeal recommendation output')
  return { recommendation, rationale }
}
