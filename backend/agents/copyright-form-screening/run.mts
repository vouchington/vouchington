import { createHash } from 'node:crypto'
import { callRecordingAgentResponseUsage, DEFAULT_AGENT_MODEL } from '@agents/_shared'
import { extractTextFromOpenAIResponse } from '@modules/openai-utils'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import {
  claimCopyrightFormScreening,
  completeCopyrightFormScreening,
  failCopyrightFormScreening,
} from '@services/copyright-notices/form-screening-executions'
import {
  type CopyrightFormIntakeForScreening,
  getCopyrightFormIntakeForScreening,
} from '@services/copyright-notices/form-screening-intake'
import { callCopyrightFormScreeningModel } from './model.mts'
import { parseCopyrightFormScreeningOutput } from './output.mts'

const PROMPT_VERSION = 'copyright-form-screening-v3'

export async function runCopyrightFormScreeningAgent(
  submissionId: string,
): Promise<'not_obviously_invalid' | 'invalid_or_spam' | null> {
  const intake = await getCopyrightFormIntakeForScreening(submissionId)
  if (!intake) return null
  const attempt = await claimCopyrightFormScreening(intake.intakeId)
  if (!attempt) return null
  try {
    const safeInput = wrapExternalContent(
      await sanitizePromptInjection(serializeCopyrightFormScreeningInput(intake)),
      { source: 'copyright_form', contentType: 'copyright-complaint' },
    )
    const response = await callRecordingAgentResponseUsage(
      () => callCopyrightFormScreeningModel(safeInput),
      { agentSlug: 'copyright-form-screening' },
    )
    const { recommendation, rationale, guidance } = parseCopyrightFormScreeningOutput(
      extractTextFromOpenAIResponse(response),
    )
    const result = await completeCopyrightFormScreening(attempt, {
      intakeId: intake.intakeId,
      inputSha256: createHash('sha256').update(safeInput).digest(),
      recommendation,
      rationale,
      guidance,
      promptVersion: PROMPT_VERSION,
      model: DEFAULT_AGENT_MODEL,
    })
    return result ? recommendation : null
  } catch (err) {
    await failCopyrightFormScreening(attempt)
    throw err
  }
}

/** Only structured, non-contact form fields; contact, email, and signature values stay out. */
function serializeCopyrightFormScreeningInput(intake: CopyrightFormIntakeForScreening): string {
  return JSON.stringify({
    source_kind: intake.sourceKind,
    jurisdiction: intake.jurisdiction,
    statutory_fields_complete: intake.statutoryFieldsComplete,
    claimant_display_name: intake.claimantDisplayName,
    work_description: intake.workDescription,
    hosted_use_urls: intake.hostedUseUrls,
    has_claimant_contact: intake.hasClaimantContact,
    has_claimant_email: intake.hasClaimantEmail,
    has_electronic_signature: intake.hasElectronicSignature,
    has_good_faith_belief: intake.goodFaithBelief,
    has_accuracy_authority_under_penalty_of_perjury: intake.accuracyAuthorityUnderPenaltyOfPerjury,
  })
}
