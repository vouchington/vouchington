import type { PageInfo } from '@voucha/types/pagination'

export type CopyrightEuNoticeInput = {
  notifier_name: string
  notifier_email: string
  good_faith_statement: true
  contact: string
  content_description: string
  grounds: string
  hosted_use_url: string
  cf_turnstile_response?: string
}

export type CopyrightEuNoticeResponse = {
  copyright_eu_notice: {
    notice_id: string
    receipt_id: string
    acknowledgment_id: string
    route_destination: 'staff_queue'
    is_duplicate: boolean
  }
  acknowledgment: {
    id: string
    attempt_count: number
    last_attempt_at: string | null
    acknowledged_at: string | null
    exhausted_at: string | null
    escalated: boolean
  }
}

export type CopyrightJurisdictionAvailabilityResponse = {
  copyright_jurisdiction_availability: { eu_dsa: boolean; uk: boolean }
}

export type CopyrightEuRedressResponse = {
  copyright_eu_redress_request: { id: string; is_duplicate: boolean }
}

export type CopyrightEuParticipantCase = {
  outcome: 'restrict' | 'no_action' | null
  decided_at: string | null
  informed_at: string | null
  reopened_at: string | null
  complaint: {
    can_submit: boolean
    window_ends_at: string | null
    request: {
      id: string
      received_at: string
      explanation: string
      filed_by: 'notifier' | 'poster' | 'reviewer'
    } | null
    decision: {
      staff_disposition: 'maintain' | 'revoke'
      rationale: string
      decided_at: string
    } | null
  }
  dispute_settlements: CopyrightEuDisputeSettlement[]
  dispute_settlements_page_info: PageInfo
}

export type CopyrightEuDisputeSettlement = {
  id: string
  body_name: string
  referred_at: string
  outcome: { result: string; decided_at: string; implemented_at: string | null } | null
}

export type CopyrightEuDisputeSettlementsPage = {
  copyright_eu_dispute_settlements: CopyrightEuDisputeSettlement[]
  page_info: PageInfo
}
