import { createHash } from 'node:crypto'
import { callAgentModel } from '@agents/_shared'
import type { ModelSelection } from '@modules/model-providers/types'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import {
  appendCopyrightSubmissionGuidance,
  getCopyrightSubmissionGuidanceSource,
} from '@services/copyright-notices/submission-guidance'
import {
  callCopyrightSubmissionGuidanceModel,
  type CopyrightSubmissionGuidanceKind,
  type CopyrightSubmissionGuidanceModelCaller,
} from './model.mts'

const PROMPT_VERSION = 'copyright-submission-guidance-v1'

export type { CopyrightSubmissionGuidanceModelCaller } from './model.mts'

/** One advisory model call, with digest of exactly the contact-redacted text shown to it. */
export async function runCopyrightSubmissionGuidanceAgent(
  submissionId: string,
  selection: ModelSelection,
  callModel: CopyrightSubmissionGuidanceModelCaller = callCopyrightSubmissionGuidanceModel,
): Promise<CopyrightSubmissionGuidanceKind | null> {
  const filing = await getCopyrightSubmissionGuidanceSource(submissionId)
  if (!filing) return null
  const modelInput = wrapExternalContent(
    await sanitizePromptInjection(JSON.stringify(filing.input)),
    { source: 'copyright_submission', contentType: filing.kind },
  )
  const { output: guidance, model } = await callAgentModel({
    agentSlug: 'copyright-submission-guidance',
    selection,
    input: modelInput,
    safetyIdentifier: createHash('sha256').update(submissionId).digest('hex'),
    callModel: (input, safetyIdentifier, call) =>
      callModel(filing.kind, input, safetyIdentifier, call),
  })
  await appendCopyrightSubmissionGuidance({
    submissionId,
    inputSha256: createHash('sha256').update(modelInput).digest(),
    promptVersion: PROMPT_VERSION,
    model,
    guidance,
  })
  return filing.kind
}
