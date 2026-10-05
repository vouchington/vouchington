import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import {
  admitCopyrightEmailCorrespondenceDecision,
  rejectCopyrightEmailCorrespondenceDecision,
} from './copyright-email-decision-actions.mts'
import { parseCopyrightTargetIds } from './http-input.mts'
import { parseCopyrightCorrespondenceSubmission } from './moderator-http-input.mts'
import {
  copyrightMcpDecisionProvenance,
  loadCopyrightMcpEmailIntake,
  requireCopyrightMcpRecommendation,
  validateCopyrightMcpConstructedRequest,
} from './copyright-mcp-write-validation.mts'

type Kind = 'supplement' | 'appeal' | 'counter_notice' | 'withdrawal' | 'court_or_ccb_hold'

export async function admitCopyrightEmailCorrespondenceFromRecommendation(
  currentUser: PrivateUser,
  intakeId: string,
  kind: Kind,
  targetIds: string[],
  rationale: string,
) {
  const intake = await loadCopyrightMcpEmailIntake(currentUser, intakeId)
  const recommendation = requireCopyrightMcpRecommendation(intake)
  const output = recommendation.structured_output
  assert(output.submission_kind === kind, 422, 'Recommendation correspondence kind does not match')
  const fields =
    kind === 'appeal'
      ? { appeal_reason: output.appeal_reason }
      : kind === 'counter_notice'
        ? {
            name: output.counter_notice_name,
            address: output.counter_notice_address,
            telephone: output.counter_notice_telephone,
            consent_to_federal_jurisdiction: output.consent_to_federal_jurisdiction,
            consent_to_service_of_process: output.consent_to_service_of_process,
            good_faith_misidentification_under_penalty_of_perjury:
              output.good_faith_misidentification_under_penalty_of_perjury,
            electronic_signature: output.counter_notice_electronic_signature,
          }
        : { submission_summary: output.submission_summary }
  const selectedIds =
    kind === 'appeal' || kind === 'counter_notice' ? parseCopyrightTargetIds(targetIds) : []
  const body = {
    kind,
    rationale,
    recommendation_id: recommendation.id,
    ...fields,
    ...(selectedIds.length ? { target_ids: selectedIds } : {}),
  }
  const structuredSubmission = parseCopyrightCorrespondenceSubmission(body)
  validateCopyrightMcpConstructedRequest(
    '/api/v1/copyright-email-intakes/:id/correspondence',
    { id: intakeId },
    body,
  )
  return admitCopyrightEmailCorrespondenceDecision({
    currentUser,
    intakeId,
    kind,
    rationale,
    targetIds: selectedIds,
    structuredSubmission,
    recommendationId: recommendation.id,
    manualFallbackReason: null,
  })
}

export async function rejectCopyrightEmailCorrespondenceFromRecommendation(
  currentUser: PrivateUser,
  intakeId: string,
  kind: Kind,
  rationale: string,
) {
  const intake = await loadCopyrightMcpEmailIntake(currentUser, intakeId)
  const provenance = copyrightMcpDecisionProvenance(intake)
  const body = { kind, rationale, ...provenance }
  validateCopyrightMcpConstructedRequest(
    '/api/v1/copyright-email-intakes/:id/correspondence-rejections',
    { id: intakeId },
    body,
  )
  return rejectCopyrightEmailCorrespondenceDecision({
    currentUser,
    intakeId,
    kind,
    rationale,
    recommendationId: intake.recommendation?.id ?? null,
    manualFallbackReason:
      'manual_fallback_reason' in provenance ? (provenance.manual_fallback_reason ?? null) : null,
  })
}
