import type { FiniteValue } from '@data-stores/psql/finite-values/index'

export type CopyrightJurisdiction = FiniteValue<'copyright_jurisdictions'>
export type CopyrightHumanReviewAction = FiniteValue<'copyright_review_actions'>
export type CopyrightSubmissionKind = FiniteValue<'copyright_notice_submission_kinds'>
export type CopyrightSubmissionSourceKind = FiniteValue<'copyright_notice_submission_source_kinds'>
export type CopyrightHoldProceedingKind =
  FiniteValue<'copyright_notice_legal_hold_assessment_proceeding_kinds'>
export type CopyrightHoldResolutionKind =
  FiniteValue<'copyright_notice_legal_hold_resolution_kinds'>
export type CopyrightCorrespondenceDirection =
  FiniteValue<'copyright_notice_correspondence_message_directions'>
export type CopyrightCorrespondenceKind = FiniteValue<'copyright_notice_correspondence_kinds'>

export type CopyrightNoticeTargetInput = {
  bindingFamily: 'post' | 'surface'
  placementId: string
  placementRevision: number
  imageId: string
  hostedUseUrl: string
}

export type CreateCopyrightNoticeAggregateInput = {
  jurisdiction: CopyrightJurisdiction
  receivedAt: Date
  claimantUserId: string | null
  claimantDisplayName: string | null
  claimantContactCiphertext: string
  workDescription: string
  policyVersion: string
  targets: CopyrightNoticeTargetInput[]
  initialSubmission: {
    kind: 'notice'
    sourceKind: CopyrightSubmissionSourceKind
    bodyCiphertext: string
  }
}

export type CopyrightNoticeRecord = {
  id: string
  jurisdiction: CopyrightJurisdiction
  legal_basis: FiniteValue<'copyright_notice_legal_bases'>
  received_at: Date
  accepted_at: Date | null
  provisional_withholding_at: Date | null
  claimant_user_id: string | null
  claimant_display_name: string | null
  claimant_contact_ciphertext: string
  work_description: string
  policy_version: string
}

export type CopyrightRestrictionRecord = {
  id: string
  copyright_notice_target_id: string
  authorizing_assessment_id: string
  imposed_at: Date
  lifted_at: Date | null
  imposed_by_id: string | null
  lifted_by_id: string | null
  human_reviewed_at: Date | null
  human_review_action: FiniteValue<'copyright_restriction_human_review_actions'> | null
  human_reviewed_by_id: string | null
}

export type CopyrightNoticeSubmissionRecord = {
  id: string
  copyright_notice_id: string
  kind: CopyrightSubmissionKind
  received_at: Date
  source_kind: CopyrightSubmissionSourceKind
  submitted_by_user_id: string | null
  body_ciphertext: string
  copyright_notice_guest_capability_id: string | null
}

export type CopyrightNoticeSubmissionAssessmentRecord = {
  id: string
  copyright_notice_submission_id: string
  assessed_at: Date
  assessed_by_id: string | null
  substantially_compliant: boolean
  copyright_notice_form_screening_id: string | null
  supersedes_assessment_id: string | null
}

export type CopyrightLegalHoldAssessmentRecord = {
  id: string
  copyright_notice_submission_id: string
  assessed_at: Date
  assessed_by_id: string | null
  from_original_claimant: boolean
  proceeding_kind: CopyrightHoldProceedingKind | null
  ccb_claim_kind: FiniteValue<'copyright_notice_legal_hold_assessment_ccb_claim_kinds'> | null
  commenced_at: Date | null
  received_by_designated_agent_at: Date | null
  same_material: boolean
  rationale_ciphertext: string
  target_ids: string[]
}

export type CopyrightLegalHoldResolutionRecord = {
  id: string
  copyright_notice_legal_hold_assessment_id: string
  resolved_at: Date
  resolved_by_id: string | null
  resolution_kind: CopyrightHoldResolutionKind
  rationale_ciphertext: string
}

export type CopyrightCorrespondenceRecord = {
  id: string
  copyright_notice_id: string
  copyright_notice_submission_id: string | null
  copyright_notice_email_intake_id: string | null
  direction: CopyrightCorrespondenceDirection
  composition_kind: FiniteValue<'copyright_notice_correspondence_message_composition_kinds'>
  correspondence_kind: CopyrightCorrespondenceKind
  body_ciphertext: string
  drafted_by_id: string | null
  approved_at: Date | null
  approved_by_id: string | null
  sent_at: Date | null
}

export type CopyrightActionIntentRecord = {
  lease_token: string | null
  id: string
  copyright_restriction_id: string
  copyright_notice_deadline_id: string | null
  expected_placement_revision: number
  action: FiniteValue<'copyright_notice_action_intent_actions'>
  state: FiniteValue<'copyright_notice_action_intent_states'>
  delivery_attempt_count: number
  claimed_at: Date | null
  completed_at: Date | null
  completed_at_reason: Extract<
    FiniteValue<'copyright_notice_action_intent_states'>,
    'completed' | 'stale' | 'blocked' | 'failed'
  > | null
  failure_message: string | null
  next_attempt_at: Date | null
}
