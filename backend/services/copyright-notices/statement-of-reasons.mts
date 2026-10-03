import {
  copyrightStatementSummary,
  copyrightStatementText,
} from './statement-of-reasons-wording.mts'

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
    decision: 'person' | 'automatic_pending_review'
    aiGuidance: boolean
  }
  legalGround: { jurisdiction: 'us_dmca'; legalBasis: 'copyright'; citation: string }
  redress: {
    key: 'appeal' | 'counter_notice' | 'court' | 'designated_agent' | 'new_notice'
    label: string
    path: string | null
  }[]
}

/** Pure legal statement construction. Existing correspondence keeps its original wording. */
export function buildCopyrightStatementOfReasons(input: CopyrightStatementInput): {
  fields: CopyrightStatementFields
  text: string
  inAppSummary: string
} {
  if (input.jurisdiction !== 'us_dmca' || input.legalBasis !== 'copyright')
    throw new Error('Unsupported copyright statement legal ground')
  if (input.event === 'restriction_ended' && (!input.restorationCause || !input.restorationOutcome))
    throw new Error('Restoration cause and outcome are required')
  const redress: CopyrightStatementFields['redress'] = []
  if (
    input.audience === 'poster' &&
    (input.event === 'restricted' || input.event === 'confirmed')
  ) {
    redress.push(
      { key: 'appeal', label: 'Appeal', path: `/copyright/notices/${input.noticeId}/appeal` },
      {
        key: 'counter_notice',
        label: 'Counter-notice',
        path: `/copyright/notices/${input.noticeId}/counter-notice`,
      },
      { key: 'court', label: 'Judicial redress', path: null },
    )
  }
  if (input.audience === 'claimant' && input.event !== 'restriction_ended') {
    if (input.event === 'reversed' || input.event === 'not_accepted')
      redress.push({ key: 'new_notice', label: 'New notice', path: '/copyright/notices/new' })
    redress.push(
      { key: 'designated_agent', label: 'Designated agent', path: '/copyright/designated-agent' },
      { key: 'court', label: 'Judicial redress', path: null },
    )
  }
  const fields: CopyrightStatementFields = {
    restriction:
      input.event === 'not_accepted' ||
      input.event === 'reversed' ||
      input.event === 'restriction_ended'
        ? null
        : { type: 'visibility_restriction', subject: 'image', deleted: false, scope: 'global' },
    facts: {
      noticeId: input.noticeId,
      receivedAt: input.receivedAt.toISOString(),
      targetUrls: input.audience === 'poster' ? input.targetUrls : [],
      basis: 'art_16_notice',
    },
    automation: {
      detection: false,
      decision: input.automatedDecision ? 'automatic_pending_review' : 'person',
      aiGuidance: input.aiGuidance,
    },
    legalGround: { jurisdiction: 'us_dmca', legalBasis: 'copyright', citation: '17 U.S.C. 512' },
    redress,
  }
  return {
    fields,
    text: copyrightStatementText(input, fields),
    inAppSummary: copyrightStatementSummary(input),
  }
}
