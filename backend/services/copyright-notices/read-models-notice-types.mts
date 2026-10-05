import type { FiniteValue } from '@data-stores/psql/finite-values/index'
import type { PageInfo } from '@voucha/types/pagination'
import type { CopyrightParticipantStatement } from './participant-statements.mts'

export type CopyrightPublicNotice = {
  id: string
  jurisdiction: Exclude<FiniteValue<'copyright_jurisdictions'>, 'other'>
  received_at: Date
  accepted_at: Date
  provisional_withholding_at: Date | null
  target_count: number
  claimant: { user_id: string; display_name: string } | null
}

export type CopyrightPublicNoticeDetail = CopyrightPublicNotice & {
  targets: Array<{
    id: string
    surface:
      | 'post-image'
      | 'user-profile-image'
      | 'user-profile-link-image'
      | 'topic-logo-image'
      | 'topic-hero-image'
      | 'community-profile-image'
      | 'community-banner-image'
    hosted_use_url: string | null
    restriction_status: 'active' | 'lifted' | 'pending'
  }>
  timeline: Array<{ id: string; event_type: string; created_at: Date }>
}

export type CopyrightEuParticipantCase = {
  outcome: FiniteValue<'copyright_territorial_decision_outcomes'> | null
  decided_at: Date | null
  informed_at: Date | null
  reopened_at: Date | null
  complaint: {
    can_submit: boolean
    window_ends_at: Date | null
    request: {
      id: string
      received_at: Date
      explanation: string
      filed_by: FiniteValue<'copyright_territorial_party_roles'>
    } | null
    decision: {
      staff_disposition: FiniteValue<'copyright_territorial_redress_decision_staff_dispositions'>
      rationale: string
      decided_at: Date
    } | null
  }
  dispute_settlements_page_info: PageInfo
  dispute_settlements: Array<{
    id: string
    body_name: string
    referred_at: Date
    outcome: {
      result: FiniteValue<'copyright_eu_dispute_settlement_results'>
      decided_at: Date
      implemented_at: Date | null
    } | null
  }>
}

export type CopyrightParticipantNoticeDetail = Omit<CopyrightPublicNoticeDetail, 'accepted_at'> & {
  accepted_at: Date | null
  statements: CopyrightParticipantStatement[]
  viewer_role: 'claimant' | 'poster' | 'staff'
  respondable_target_ids: string[]
  submissions: Array<{
    id: string
    kind: FiniteValue<'copyright_notice_submission_kinds'>
    received_at: Date
    source_kind: FiniteValue<'copyright_notice_submission_source_kinds'>
  }>
  eu?: CopyrightEuParticipantCase
}
