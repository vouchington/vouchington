import {
  copyrightStatementSummary,
  copyrightStatementText,
} from './statement-of-reasons-wording.mts'
import { copyrightStatementLegalGround } from './statement-of-reasons-legal-ground.mts'

import type {
  CopyrightStatementInput,
  CopyrightStatementFields,
} from './statement-of-reasons-types.mts'
export type {
  CopyrightStatementEvent,
  CopyrightRestorationCause,
  CopyrightRestorationOutcome,
  CopyrightStatementInput,
  CopyrightStatementFields,
} from './statement-of-reasons-types.mts'

/** Pure legal statement construction. Existing correspondence keeps its original wording. */
export function buildCopyrightStatementOfReasons(input: CopyrightStatementInput): {
  fields: CopyrightStatementFields
  text: string
  inAppSummary: string
} {
  if (input.legalBasis !== 'copyright')
    throw new Error('Unsupported copyright statement legal ground')
  const legalGround = copyrightStatementLegalGround(input.jurisdiction)
  if (input.event === 'restriction_ended' && (!input.restorationCause || !input.restorationOutcome))
    throw new Error('Restoration cause and outcome are required')
  const redress: CopyrightStatementFields['redress'] = []
  if (
    input.audience === 'poster' &&
    (input.event === 'restricted' || input.event === 'confirmed')
  ) {
    if (input.jurisdiction === 'us_dmca')
      redress.push(
        { key: 'appeal', label: 'Appeal', path: `/copyright/notices/${input.noticeId}/appeal` },
        {
          key: 'counter_notice',
          label: 'Counter-notice',
          path: `/copyright/notices/${input.noticeId}/counter-notice`,
        },
      )
    if (input.jurisdiction === 'eu_dsa') redress.push(...euRedressRoutes(input))
    redress.push({ key: 'court', label: 'Judicial redress', path: null })
  }
  if (
    input.audience === 'claimant' &&
    (input.jurisdiction === 'eu_dsa' || input.event !== 'restriction_ended')
  ) {
    if (input.jurisdiction === 'us_dmca') {
      if (input.event === 'reversed' || input.event === 'not_accepted')
        redress.push({ key: 'new_notice', label: 'New notice', path: '/copyright/notices/new' })
      redress.push({
        key: 'designated_agent',
        label: 'Designated agent',
        path: '/copyright/designated-agent',
      })
    }
    if (input.jurisdiction === 'eu_dsa') redress.push(...euRedressRoutes(input))
    redress.push({ key: 'court', label: 'Judicial redress', path: null })
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
      decision:
        input.event === 'restriction_ended' && input.restorationCause === 'counter_notice_window'
          ? 'automatic_deadline'
          : input.automatedDecision
            ? 'automatic_pending_review'
            : 'person',
      aiGuidance: input.aiGuidance,
    },
    legalGround: legalGround.fields,
    redress,
  }
  return {
    fields,
    text: copyrightStatementText(input, fields),
    inAppSummary: copyrightStatementSummary(input),
  }
}

function euRedressRoutes(input: CopyrightStatementInput): CopyrightStatementFields['redress'] {
  return [
    {
      key: 'internal_complaint',
      label: 'Internal complaint',
      path:
        input.audience === 'poster' || input.claimantHasAccount
          ? `/copyright/notices/${input.noticeId}/complaint`
          : null,
    },
    {
      key: 'out_of_court_dispute_settlement',
      label: 'Out-of-court dispute settlement',
      path: null,
    },
  ]
}
