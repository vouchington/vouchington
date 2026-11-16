import { createHash } from 'node:crypto'
import { callAgentModel } from '@agents/_shared'
import type { ModelSelection } from '@modules/model-providers/types'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import {
  appendCopyrightSubmissionGuidance,
  getCopyrightSubmissionGuidanceSource,
} from '@services/copyright-notices/submission-guidance'
import {
  completeCopyrightSubmissionGuidanceRunFromExisting,
  isCopyrightSubmissionGuidanceRunActive,
  markCopyrightSubmissionGuidanceRunExpired,
} from '@services/copyright-notices/submission-guidance-runs'
import {
  callCopyrightSubmissionGuidanceModel,
  COPYRIGHT_SUBMISSION_GUIDANCE_PROMPT_VERSION,
  type CopyrightSubmissionGuidanceKind,
  type CopyrightSubmissionGuidanceModelCaller,
} from './model.mts'

export type { CopyrightSubmissionGuidanceModelCaller } from './model.mts'

/** One advisory model call, with digest of exactly the contact-redacted text shown to it. */
export async function runCopyrightSubmissionGuidanceAgent(
  submissionId: string,
  runId: string,
  selection: ModelSelection,
  callModel: CopyrightSubmissionGuidanceModelCaller = callCopyrightSubmissionGuidanceModel,
): Promise<CopyrightSubmissionGuidanceKind | null> {
  if (!(await isCopyrightSubmissionGuidanceRunActive(runId))) return null
  if (
    await completeCopyrightSubmissionGuidanceRunFromExisting(
      runId,
      submissionId,
      COPYRIGHT_SUBMISSION_GUIDANCE_PROMPT_VERSION,
    )
  )
    return null
  const filing = await getCopyrightSubmissionGuidanceSource(submissionId)
  if (!filing) {
    await markCopyrightSubmissionGuidanceRunExpired(runId)
    return null
  }
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
  const saved = await appendCopyrightSubmissionGuidance({
    submissionId,
    runId,
    inputSha256: createHash('sha256').update(modelInput).digest(),
    promptVersion: COPYRIGHT_SUBMISSION_GUIDANCE_PROMPT_VERSION,
    model,
    guidance,
  })
  // An erased input leaves no result; a run another worker already ended stays as it is.
  if (!saved) await markCopyrightSubmissionGuidanceRunExpired(runId)
  return filing.kind
}
