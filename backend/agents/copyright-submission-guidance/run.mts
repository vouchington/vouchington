import { createHash } from 'node:crypto'
import { callRecordingAgentResponseUsage, DEFAULT_AGENT_MODEL } from '@agents/_shared'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { extractTextFromOpenAIResponse } from '@modules/openai-utils'
import { copyrightSubmissionGuidance } from '@services/copyright-notices'
import {
  callCopyrightSubmissionGuidanceModel,
  type CopyrightSubmissionGuidanceKind,
  type CopyrightSubmissionGuidanceModelCaller,
} from './model.mts'
import { parseCopyrightSubmissionGuidanceOutput } from './output.mts'

const PROMPT_VERSION = 'copyright-submission-guidance-v1'

export type { CopyrightSubmissionGuidanceModelCaller } from './model.mts'

/** One advisory model call, with digest of exactly the contact-redacted text shown to it. */
export async function runCopyrightSubmissionGuidanceAgent(
  submissionId: string,
  callModel: CopyrightSubmissionGuidanceModelCaller = callCopyrightSubmissionGuidanceModel,
): Promise<CopyrightSubmissionGuidanceKind | null> {
  const filing = await copyrightSubmissionGuidance.get(submissionId)
  if (!filing) return null
  const modelInput = wrapExternalContent(
    await sanitizePromptInjection(JSON.stringify(filing.input)),
    { source: 'copyright_submission', contentType: filing.kind },
  )
  const response = await callRecordingAgentResponseUsage(
    () =>
      callModel(filing.kind, modelInput, createHash('sha256').update(submissionId).digest('hex')),
    { agentSlug: 'copyright-submission-guidance' },
  )
  const guidance = parseCopyrightSubmissionGuidanceOutput(
    extractTextFromOpenAIResponse(response),
    filing.kind,
  )
  await copyrightSubmissionGuidance.append({
    submissionId,
    inputSha256: createHash('sha256').update(modelInput).digest(),
    promptVersion: PROMPT_VERSION,
    model: DEFAULT_AGENT_MODEL,
    guidance,
  })
  return filing.kind
}
