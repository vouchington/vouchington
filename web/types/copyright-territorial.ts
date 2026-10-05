import type { PageInfo } from '@voucha/types/pagination'

/** Staff-only receipt, acknowledgment, and current decision for a received EU or UK notice. */
export type CopyrightStaffTerritorialCase = {
  hosted_use_url: string
  grounds: string
  notifier: { name: string | null; email: string | null }
  recipients: Array<{
    role: 'claimant' | 'poster'
    user_id: string | null
    informed_at: string | null
    state: 'pending' | 'claimed' | 'sent' | 'failed' | 'bounced' | null
  }>
  complaints: Array<{
    id: string
    filed_by: 'notifier' | 'poster' | 'reviewer'
    submitted_by_id: string | null
    received_at: string
    explanation: string
    informed_at: string | null
    window_ends_at: string | null
    decision: {
      id: string
      decided_at: string
      staff_disposition: 'maintain' | 'revoke'
      rationale: string
    } | null
  }>
  complaints_page_info: PageInfo
  dispute_settlements_page_info: PageInfo
  dispute_settlements: Array<{
    id: string
    body_name: string
    referred_at: string
    referred_by_party: 'poster' | 'notifier'
    referred_by_id: string | null
    outcome: { result: string; decided_at: string; implemented_at: string | null } | null
  }>
  acknowledgment: {
    attempt_count: number
    last_attempt_at: string | null
    acknowledged_at: string | null
    exhausted_at: string | null
    escalated: boolean
  }
  reopened_at: string | null
  decision: {
    id: string
    outcome: 'restrict' | 'no_action'
    decided_at: string
    rationale: string
    public_explanation: string
  } | null
}
