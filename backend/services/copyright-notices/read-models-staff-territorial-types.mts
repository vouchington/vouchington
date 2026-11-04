import type { FiniteValue } from '@data-stores/psql/finite-values/index'

export type CopyrightStaffTerritorialCase = {
  hosted_use_url: string
  grounds: string
  notifier: { name: string | null; email: string | null }
  /** Complaints on the live decision and dispute settlements of the notice; the rows are paged. */
  complaint_count: number
  dispute_settlement_count: number
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
