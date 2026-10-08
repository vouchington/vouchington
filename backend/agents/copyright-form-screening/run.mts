import { createHash } from 'node:crypto'
import { callAgentModel } from '@agents/_shared'
import type { ModelSelection } from '@modules/model-providers/types'
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
import {
  callCopyrightFormScreeningModel,
  type CopyrightFormScreeningModelCaller,
} from './model.mts'

const PROMPT_VERSION = 'copyright-form-screening-v3'

export type { CopyrightFormScreeningModelCaller } from './model.mts'

export async function runCopyrightFormScreeningAgent(
  submissionId: string,
  selection: ModelSelection,
  callModel: CopyrightFormScreeningModelCaller = callCopyrightFormScreeningModel,
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
    const { output, model } = await callAgentModel({
      agentSlug: 'copyright-form-screening',
      selection,
      input: safeInput,
      safetyIdentifier: createHash('sha256').update(submissionId).digest('hex'),
      callModel,
    })
    const { recommendation, rationale, guidance } = output
    const result = await completeCopyrightFormScreening(attempt, {
      intakeId: intake.intakeId,
      inputSha256: createHash('sha256').update(safeInput).digest(),
      recommendation,
      rationale,
      guidance,
      promptVersion: PROMPT_VERSION,
      model,
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
