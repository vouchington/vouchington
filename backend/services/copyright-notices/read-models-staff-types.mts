export type CopyrightStaffCase = {
  id: string
  received_at: Date
  jurisdiction: 'us_dmca'
  claimant: { display_name: string | null; contact: string }
  work_description: string
  targets: Array<{
    id: string
    placement_key: string
    placement_revision: number
    image_id: string
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
    source_kind: string
    screening: { recommendation: string; rationale: string } | null
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
    recommendation: { id: string; recommendation: string; rationale: string } | null
  }>
  counter_notices: Array<{
    submission_id: string
    received_at: Date
    target_ids: string[]
    statement: Record<string, unknown>
  }>
  legal_holds: Array<{
    submission_id: string
    received_at: Date
    statement: Record<string, unknown>
    assessment: {
      id: string
      from_original_claimant: boolean
      proceeding_kind: 'federal_court' | 'ccb' | null
      ccb_claim_kind: 'claim' | 'counterclaim' | null
      commenced_at: Date | null
      received_by_designated_agent_at: Date | null
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
  email_correspondence: Array<{
    submission_id: string | null
    kind: 'supplement' | 'appeal' | 'counter_notice' | 'withdrawal' | 'court_or_ccb_hold'
    action: 'admitted' | 'rejected'
    reviewed_at: Date
  }>
}
