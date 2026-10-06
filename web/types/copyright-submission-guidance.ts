export type {
  CopyrightCounterNoticeGuidance,
  CopyrightLegalHoldGuidance,
} from '@ts-shared/utils/copyright-submission-guidance'

/** Advisory AI guidance for a structured form; never a decision. */
export type CopyrightFormGuidance = {
  summary: string
  elements: Array<{
    element:
      | 'signature'
      | 'work_identification'
      | 'material_identification'
      | 'contact_information'
      | 'has_good_faith_statement'
      | 'accuracy_authority_statement'
    status: 'present' | 'missing' | 'unclear'
    gap: string | null
  }>
  risk_notes: Array<{
    kind: 'possible_fair_use' | 'abuse_signal' | 'mismatched_claimant'
    note: string
  }>
  suggested_action: 'approve_intake' | 'request_information' | 'reject_intake' | 'escalate_to_owner'
}
