export type CopyrightStatementEvent =
  | 'restricted'
  | 'confirmed'
  | 'reversed'
  | 'not_accepted'
  | 'restriction_ended'
export type CopyrightRestorationCause =
  | 'review_reversed'
  | 'appeal_reversed'
  | 'counter_notice_window'
  | 'hold_resolved'
  | 'administrator_lift'
  | 'complaint_reversed'
export type CopyrightRestorationOutcome = 'visible' | 'still_hidden' | 'unavailable'
export type CopyrightStatementInput = {
  audience: 'poster' | 'claimant'
  event: CopyrightStatementEvent
  noticeId: string
  receivedAt: Date
  jurisdiction: string
  legalBasis: string
  targetUrls: string[]
  automatedDecision: boolean
  aiGuidance: boolean
  explanation?: string
  restorationCause?: CopyrightRestorationCause
  restorationOutcome?: CopyrightRestorationOutcome
}
export type CopyrightStatementFields = {
  restriction: {
    type: 'visibility_restriction'
    subject: 'image'
    deleted: false
    scope: 'global'
  } | null
  facts: { noticeId: string; receivedAt: string; targetUrls: string[]; basis: 'art_16_notice' }
  automation: {
    detection: false
    decision: 'person' | 'automatic_pending_review' | 'automatic_deadline'
    aiGuidance: boolean
  }
  legalGround: {
    jurisdiction: 'us_dmca' | 'eu_dsa' | 'uk'
    legalBasis: 'copyright'
    citation: string
  }
  redress: {
    key: 'appeal' | 'counter_notice' | 'court' | 'designated_agent' | 'new_notice'
    label: string
    path: string | null
  }[]
}
