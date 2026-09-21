/* oxlint-disable max-lines -- Copyright domain records stay together as the aggregate's canonical contract. */
import type { CopyrightDeliveryIntentRecord } from './delivery-types.mts'
export type { CopyrightDeliveryIntentRecord } from './delivery-types.mts'

export type CopyrightJurisdiction = 'us_dmca' | 'eu_dsa' | 'uk' | 'other'
export type CopyrightHumanReviewAction = 'confirm' | 'reverse'
type CopyrightFormSubmissionKind = 'notice' | 'appeal' | 'counter_notice' | 'withdrawal'
type CopyrightLegalFollowupSubmissionKind = 'court_or_ccb_hold' | 'supplement'
export type CopyrightSubmissionKind =
  | CopyrightFormSubmissionKind
  | CopyrightLegalFollowupSubmissionKind
export type CopyrightSubmissionSourceKind = 'signed_in_form' | 'guest_form' | 'email' | 'staff'
export type CopyrightHoldProceedingKind = 'federal_court' | 'ccb'
export type CopyrightHoldResolutionKind = 'dismissed' | 'proceeding_ended' | 'superseded'
export type CopyrightCorrespondenceDirection = 'inbound' | 'outbound'
export type CopyrightCorrespondenceKind =
  | 'receipt'
  | 'request_information'
  | 'restriction_notice'
  | 'counter_notice_forwarding'
  | 'restoration_notice'
  | 'status_update'
  | 'inbound_message'

export type CopyrightNoticeTargetInput = {
  placementKey: string
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
  legal_basis: 'copyright'
  received_at: Date
  accepted_at: Date | null
  provisional_withholding_at: Date | null
  claimant_user_id: string | null
  claimant_display_name: string | null
  claimant_contact_ciphertext: string
  work_description: string
  policy_version: string
}

export type CopyrightNoticeTargetRecord = {
  id: string
  copyright_notice_id: string
  placement_key: string
  placement_revision: number
  image_id: string
  hosted_use_url: string
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
  human_review_action: CopyrightHumanReviewAction | null
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

export type CopyrightAppealRecommendationRecord = {
  id: string
  copyright_notice_submission_id: string
  input_sha256: Buffer
  prompt_version: string
  model: string
  recommendation: 'confirm' | 'modify' | 'reverse' | 'uncertain'
  rationale_ciphertext: string
  created_at: Date
  updated_at: Date
}

export type CopyrightNoticeDeadlineRecord = {
  id: string
  copyright_notice_id: string
  qualifying_counter_notice_assessment_id: string
  earliest_restoration_at: Date
  escalation_at: Date
  restoration_deadline_at: Date
  resolved_at: Date | null
  cancelled_at: Date | null
}

export type CopyrightLegalHoldAssessmentRecord = {
  id: string
  copyright_notice_submission_id: string
  assessed_at: Date
  assessed_by_id: string | null
  from_original_claimant: boolean
  proceeding_kind: CopyrightHoldProceedingKind | null
  ccb_claim_kind: 'claim' | 'counterclaim' | null
  commenced_at: Date | null
  received_by_designated_agent_at: Date | null
  same_material: boolean
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
  composition_kind: 'inbound' | 'deterministic_template' | 'staff' | 'agent'
  correspondence_kind: CopyrightCorrespondenceKind
  body_ciphertext: string
  drafted_by_id: string | null
  approved_at: Date | null
  approved_by_id: string | null
  sent_at: Date | null
}

export type CopyrightLifecycleEventRecord = {
  id: string
  copyright_notice_id: string
  event_type: string
  actor_user_id: string | null
  metadata: Record<string, unknown>
  created_at: Date
}

export type CopyrightEvidenceArtifactRecord = {
  id: string
  copyright_notice_submission_id: string
  storage_key: string
  sha256: Buffer
  mime_type: string
  byte_size: number
}

export type CopyrightActionIntentRecord = {
  id: string
  copyright_restriction_id: string
  copyright_notice_deadline_id: string | null
  expected_placement_revision: number
  action: 'withhold' | 'restore'
  completed_at: Date | null
}

export type CopyrightAppealReviewRecord = {
  id: string
  copyright_notice_submission_id: string
  copyright_restriction_id: string
  copyright_notice_appeal_recommendation_id: string | null
  reviewed_at: Date
  reviewed_by_id: string | null
  action: CopyrightHumanReviewAction
  rationale_ciphertext: string
  manual_fallback_reason_ciphertext: string | null
}

export type CopyrightCounterNoticeReviewRecord = {
  id: string
  copyright_notice_submission_id: string
  copyright_notice_submission_assessment_id: string
  copyright_notice_deadline_id: string | null
  reviewed_at: Date
  reviewed_by_id: string | null
  accepted: boolean
  rationale_ciphertext: string
}

export type CopyrightEmailCorrespondenceReviewRecord = {
  id: string
  copyright_notice_email_intake_id: string
  copyright_notice_id: string
  action: 'pending' | 'admitted' | 'rejected'
  kind: 'supplement' | 'appeal' | 'counter_notice' | 'withdrawal' | 'court_or_ccb_hold' | null
  reviewed_at: Date | null
  reviewed_by_id: string | null
}

export type CopyrightNoticePrivateAggregate = {
  notice: CopyrightNoticeRecord
  targets: CopyrightNoticeTargetRecord[]
  restrictions: CopyrightRestrictionRecord[]
  submissions: CopyrightNoticeSubmissionRecord[]
  appealRecommendations: CopyrightAppealRecommendationRecord[]
  appealReviews: CopyrightAppealReviewRecord[]
  counterNoticeReviews: CopyrightCounterNoticeReviewRecord[]
  emailCorrespondenceReviews: CopyrightEmailCorrespondenceReviewRecord[]
  assessments: CopyrightNoticeSubmissionAssessmentRecord[]
  deadlines: CopyrightNoticeDeadlineRecord[]
  holdAssessments: CopyrightLegalHoldAssessmentRecord[]
  holdResolutions: CopyrightLegalHoldResolutionRecord[]
  evidenceArtifacts: CopyrightEvidenceArtifactRecord[]
  correspondence: CopyrightCorrespondenceRecord[]
  lifecycleEvents: CopyrightLifecycleEventRecord[]
  actionIntents: CopyrightActionIntentRecord[]
  deliveryIntents: CopyrightDeliveryIntentRecord[]
}
