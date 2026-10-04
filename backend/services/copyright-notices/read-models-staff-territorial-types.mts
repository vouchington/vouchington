import type { FiniteValue } from '@data-stores/psql/finite-values/index'
import type { PageInfo } from '@voucha/types/pagination'
import type { CopyrightTerritorialStaffRecipient } from './read-models-staff-territorial-recipients.mts'
import type { CopyrightTerritorialStaffComplaint } from './read-models-staff-territorial-complaints.mts'
export type CopyrightStaffTerritorialCase = {
  hosted_use_url: string
  grounds: string
  notifier: { name: string | null; email: string | null }
  recipients: CopyrightTerritorialStaffRecipient[]
  complaints: CopyrightTerritorialStaffComplaint[]
  complaints_page_info: PageInfo
  dispute_settlements_page_info: PageInfo
  dispute_settlements: Array<{
    id: string
    body_name: string
    referred_at: Date
    referred_by_party: Extract<
      FiniteValue<'copyright_territorial_party_roles'>,
      'poster' | 'notifier'
    >
    referred_by_user_id: string | null
    outcome: {
      result: FiniteValue<'copyright_eu_dispute_settlement_results'>
      decided_at: Date
      implemented_at: Date | null
    } | null
  }>
  acknowledgment: {
    attempt_count: number
    last_attempt_at: Date | null
    acknowledged_at: Date | null
    exhausted_at: Date | null
    escalated: boolean
  }
  reopened_at: Date | null
  decision: {
    id: string
    outcome: FiniteValue<'copyright_territorial_decision_outcomes'>
    decided_at: Date
    rationale: string
    public_explanation: string
  } | null
}
