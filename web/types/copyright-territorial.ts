/** Staff-only receipt, acknowledgment, and current decision for a received EU or UK notice. */
export type CopyrightStaffTerritorialCase = {
  hosted_use_url: string
  grounds: string
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
