import type { CopyrightHumanReviewAction } from '../../../services/copyright-notices/types.mts'

// Row shapes only the private-aggregate test read model consumes; production reads its own columns.
export type CopyrightNoticeTargetRecord = {
  id: string
  copyright_notice_id: string
  placement_id: string
  placement_revision: number
  image_id: string
  hosted_use_url: string
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

export type CopyrightLifecycleEventRecord = {
  id: string
  copyright_notice_id: string
  change_type: string
  changed_by_id: string | null
  copyright_notice_submission_id: string | null
  copyright_notice_submission_assessment_id: string | null
  copyright_notice_evidence_artifact_id: string | null
  copyright_notice_correspondence_id: string | null
  copyright_notice_legal_hold_assessment_id: string | null
  copyright_notice_legal_hold_resolution_id: string | null
  copyright_notice_deadline_id: string | null
  copyright_restriction_id: string | null
  copyright_notice_action_intent_id: string | null
  copyright_notice_email_intake_id: string | null
  copyright_notice_delivery_work_item_id: string | null
  media_delivery_registry_record_delivery_key: string | null
  copyright_notice_guest_capability_id: string | null
  review_action: CopyrightHumanReviewAction | null
  review_rationale_ciphertext: string | null
  is_counter_notice_accepted: boolean | null
  recovery_source: 'durable_review' | 'durable_decision' | null
  replay_reason: 'operator_replay' | null
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
  is_accepted: boolean
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
