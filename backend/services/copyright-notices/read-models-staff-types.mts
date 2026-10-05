import type { FiniteValue } from '@data-stores/psql/finite-values/index'
import type { ClaimantMisuseSummary } from './claimant-misuse-summary.mts'
import type { CopyrightFormGuidance } from './form-screening-guidance.mts'
import type {
  CopyrightCounterNoticeGuidance,
  CopyrightLegalHoldGuidance,
} from '@ts-shared/utils/copyright-submission-guidance'
import type { CopyrightStaffTerritorialCase } from './read-models-staff-territorial-types.mts'

export type CopyrightStaffCase = {
  id: string
  received_at: Date
  jurisdiction: Exclude<FiniteValue<'copyright_jurisdictions'>, 'other'>
  territorial?: CopyrightStaffTerritorialCase
  claimant: {
    display_name: string | null
    contact: string
    /** The claimant account's misuse ledger, or null when no account filed the notice. */
    misuse: ClaimantMisuseSummary | null
  }
  work_description: string
  targets: Array<{
    id: string
    placement_key: string
    placement_revision: number
    image_id: string
    surface:
      | 'post-image'
      | 'user-profile-image'
      | 'user-profile-link-image'
      | 'topic-logo-image'
      | 'topic-hero-image'
      | 'community-profile-image'
      | 'community-banner-image'
    provenance: {
      set_by_id: string
      set_by_administrator: boolean | null
      uploaded_by_id: string | null
    } | null
    hosted_use_url: string
  }>
  evidence: Array<{
    id: string
    submission_id: string
    mime_type: string
    byte_size: number
    sha256: string
  }>
  form_review: {
    intake_id: string
    source_kind: FiniteValue<'copyright_notice_submission_source_kinds'>
    screening: {
      state: 'pending' | 'failed' | 'completed'
      recommendation: FiniteValue<'copyright_notice_form_screening_recommendations'> | null
      rationale: string | null
      /** Advisory AI guidance for the moderator; never a decision. */
      guidance: CopyrightFormGuidance | null
    } | null
    /** The recorded moderator decision; null while the intake awaits review. */
    review: {
      is_accepted: boolean
      reviewed_at: Date
      /** Null once the reviewing moderator's account is erased. */
      reviewed_by_id: string | null
    } | null
  } | null
  restrictions: Array<{
    id: string
    target_id: string
    imposed_at: Date
    status: 'pending_review' | 'confirmed' | 'reversed' | 'lifted'
  }>
  appeals: Array<{
    submission_id: string
    reason: string
    target_ids: string[]
    recommendation: {
      id: string
      recommendation: FiniteValue<'copyright_notice_appeal_recommendation_outcomes'>
      rationale: string
    } | null
  }>
  counter_notices: Array<{
    submission_id: string
    received_at: Date
    target_ids: string[]
    statement: Record<string, unknown>
    guidance: CopyrightCounterNoticeGuidance | null
  }>
  legal_holds: Array<{
    submission_id: string
    received_at: Date
    statement: Record<string, unknown>
    guidance: CopyrightLegalHoldGuidance | null
    assessment: {
      id: string
      is_from_original_claimant: boolean
      proceeding_kind: FiniteValue<'copyright_notice_legal_hold_assessment_proceeding_kinds'> | null
      ccb_claim_kind: FiniteValue<'copyright_notice_legal_hold_assessment_ccb_claim_kinds'> | null
      commenced_at: Date | null
      received_by_designated_agent_at: Date | null
      is_same_material: boolean
      target_ids: string[]
      qualifying: boolean
      resolved: boolean
    } | null
  }>
  action_intents: Array<{
    id: string
    action: FiniteValue<'copyright_notice_action_intent_actions'>
    state: FiniteValue<'copyright_notice_action_intent_states'>
    failure_message: string | null
  }>
  delivery_intents: Array<{
    id: string
    delivery_kind: FiniteValue<'copyright_notice_delivery_kinds'>
    channel: FiniteValue<'copyright_notice_delivery_intent_channels'>
    state: FiniteValue<'copyright_notice_delivery_intent_states'>
    delivery_attempt_count: number
  }>
  /**
   * Unreviewed uploads that matched an image this case confirmed as infringing. Each is a prompt
   * for staff to look, never a finding: the upload stays published whatever staff decide.
   */
  staydown_matches: Array<{
    id: string
    /** The matching image; for an exact match, the registered image itself. */
    image_id: string
    registered_image_id: string
    uploaded_by_id: string
    match_kind: FiniteValue<'copyright_staydown_match_kinds'>
    /** Differing bits out of 64; 0 for an exact match. */
    hamming_distance: number
    matched_at: Date
  }>
  email_correspondence: Array<{
    submission_id: string | null
    kind: FiniteValue<'copyright_notice_email_correspondence_review_kinds'>
    action: Exclude<FiniteValue<'copyright_notice_email_correspondence_review_actions'>, 'pending'>
    reviewed_at: Date
  }>
}

export type CopyrightStaffQueueReason =
  | 'territorial_notice_review'
  | 'territorial_decision_reopened'
  | 'territorial_redress_review'
  | 'form_intake_review'
  | 'restriction_review'
  | 'appeal_review'
  | 'counter_notice_review'
  | 'legal_hold_review'
  | 'action_failed'
  | 'enforcement_pending'
  | 'delivery_failed'
  | 'staydown_review'
  | 'deadline_due'
  | 'deadline_missed'

/** A queued case plus why it is queued, how long it has waited, and its next open deadline. */
export interface CopyrightStaffQueueCase extends CopyrightStaffCase {
  reasons: CopyrightStaffQueueReason[]
  waiting_since: Date
  next_deadline: { escalation_at: Date; restoration_deadline_at: Date } | null
}
