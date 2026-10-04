import type { CopyrightImageSurface } from './copyright-image-surfaces'
export { copyrightImageSurfaceLabel } from './copyright-image-surfaces'
export type { CopyrightImageSurface } from './copyright-image-surfaces'

import type { CopyrightParticipantStatement } from './copyright-statements'
import type { CopyrightStaffClaimant } from './copyright-claimant-misuse'
import type { CopyrightStaydownMatch } from './copyright-staydown'
import type {
  CopyrightFormGuidance,
  CopyrightCounterNoticeGuidance,
  CopyrightLegalHoldGuidance,
} from './copyright-submission-guidance'
export type {
  CopyrightFormGuidance,
  CopyrightCounterNoticeGuidance,
  CopyrightLegalHoldGuidance,
} from './copyright-submission-guidance'

export type CopyrightNoticeSummary = {
  id: string
  jurisdiction: 'us_dmca'
  received_at: string
  accepted_at: string
  provisional_withholding_at: string | null
  target_count: number
  claimant: { user_id: string; display_name: string } | null
}

export type CopyrightNoticesPage = {
  copyright_notices: CopyrightNoticeSummary[]
  page_info: {
    has_next_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}

export type CopyrightNoticeDetail = CopyrightNoticeSummary & {
  targets: Array<{
    id: string
    hosted_use_url: string | null
    surface: CopyrightImageSurface
    restriction_status: 'active' | 'lifted' | 'pending'
  }>
  timeline: Array<{ id: string; event_type: string; created_at: string }>
}

export type CopyrightParticipantNoticeDetail = CopyrightNoticeDetail & {
  statements: CopyrightParticipantStatement[]
  viewer_role: 'claimant' | 'poster' | 'staff'
  respondable_target_ids: string[]
  submissions: Array<{ id: string; kind: string; received_at: string; source_kind: string }>
}

export type CopyrightNoticeResponseEligibility = Pick<
  CopyrightParticipantNoticeDetail,
  'viewer_role' | 'respondable_target_ids'
>

export type CopyrightStaffQueueItem = {
  id: string
  received_at: string
  jurisdiction: 'us_dmca'
  claimant: CopyrightStaffClaimant
  work_description: string
  targets: Array<{
    id: string
    placement_key: string
    placement_revision: number
    image_id: string
    hosted_use_url: string
    surface: CopyrightImageSurface
    provenance: {
      set_by_id: string
      set_by_administrator: boolean | null
      uploaded_by_id: string
    } | null
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
    source_kind: string
    screening: {
      state: 'pending' | 'failed' | 'completed'
      recommendation: string | null
      rationale: string | null
      guidance: CopyrightFormGuidance | null
    } | null
    review: {
      accepted: boolean
      reviewed_at: string
      reviewed_by_id: string | null
    } | null
  } | null
  restrictions: Array<{
    id: string
    target_id: string
    imposed_at: string
    status: 'pending_review' | 'confirmed' | 'reversed' | 'lifted'
  }>
  appeals: Array<{
    submission_id: string
    reason: string
    target_ids: string[]
    recommendation: { id: string; recommendation: string; rationale: string } | null
  }>
  counter_notices: Array<{
    submission_id: string
    received_at: string
    target_ids: string[]
    statement: Record<string, unknown>
    guidance: CopyrightCounterNoticeGuidance | null
  }>
  legal_holds: Array<{
    submission_id: string
    received_at: string
    statement: Record<string, unknown>
    guidance: CopyrightLegalHoldGuidance | null
    assessment: {
      id: string
      from_original_claimant: boolean
      proceeding_kind: 'federal_court' | 'ccb' | null
      ccb_claim_kind: 'claim' | 'counterclaim' | null
      commenced_at: string | null
      received_by_designated_agent_at: string | null
      same_material: boolean
      target_ids: string[]
      qualifying: boolean
      resolved: boolean
    } | null
  }>
  action_intents: Array<{
    id: string
    action: 'withhold' | 'restore'
    state: 'pending' | 'claimed' | 'completed' | 'stale' | 'blocked' | 'failed'
    failure_message: string | null
  }>
  delivery_intents: Array<{
    id: string
    delivery_kind: string
    channel: 'in_app' | 'email'
    state: 'pending' | 'claimed' | 'sent' | 'failed' | 'bounced'
    delivery_attempt_count: number
  }>
  staydown_matches: CopyrightStaydownMatch[]
  email_correspondence: Array<{
    submission_id: string | null
    kind: 'supplement' | 'appeal' | 'counter_notice' | 'withdrawal' | 'court_or_ccb_hold'
    action: 'admitted' | 'rejected'
    reviewed_at: string
  }>
  reasons: CopyrightStaffQueueReason[]
  waiting_since: string
  next_deadline: { escalation_at: string; restoration_deadline_at: string } | null
}

export type CopyrightStaffQueueReason =
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

export type CopyrightStaffQueuePage = {
  copyright_notices: CopyrightStaffQueueItem[]
  page_info: CopyrightNoticesPage['page_info']
}

export type {
  CopyrightEmailIntakeQueueItem,
  CopyrightEmailIntakeQueuePage,
} from './copyright-email-intake-queue'
