import type { CopyrightDeliveryKind } from './delivery-types.mts'
import type {
  CopyrightStatementInput,
  CopyrightStatementFields,
} from './statement-of-reasons-types.mts'

export function copyrightReceiptText(noticeId?: string): string {
  return `We received your copyright notice${noticeId ? ` for case ${noticeId}` : ''}. We will review it and contact you if we need more information.`
}

export function copyrightPromotionText(noticeId: string): string {
  return `Your emailed copyright notice is now case ${noticeId}. We will review it and contact you if we need more information.`
}

export function copyrightStatementText(
  input: CopyrightStatementInput,
  fields: CopyrightStatementFields,
): string {
  const decision = copyrightStatementSummary(input)
  const facts = `This decision concerns copyright case ${input.noticeId}, received ${input.receivedAt.toISOString()}, and was taken in response to a notice. ${fields.facts.targetUrls.join(' ')}`
  const scope = fields.restriction
    ? 'The image is withheld from visibility globally. It has not been deleted. The restriction continues until review or the applicable restoration process ends it.'
    : ''
  const automation = input.automatedDecision
    ? 'The provisional restriction was imposed automatically. A person will review it.'
    : 'A person made this decision.'
  const assistance = input.aiGuidance
    ? 'Automated tools assisted with processing this case.'
    : 'Automated tools did not assist with processing this case.'
  const legal = 'Legal ground: copyright infringement under 17 U.S.C. 512 (US DMCA).'
  const redress = fields.redress
    .map(route =>
      route.key === 'court'
        ? 'You may seek judicial redress through a court.'
        : `${route.label}: ${route.path}`,
    )
    .join(' ')
  return [
    decision,
    scope,
    facts.trim(),
    automation,
    'Automated detection was not used.',
    assistance,
    legal,
    redress,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function copyrightStatementSummary(input: CopyrightStatementInput): string {
  switch (input.event) {
    case 'restricted':
      return `An image was restricted for copyright case ${input.noticeId}. See the case page for the reasons and redress routes.`
    case 'confirmed':
      return `A person confirmed the image restriction for copyright case ${input.noticeId}. See the case page for the reasons and redress routes.`
    case 'reversed':
      return `A person reversed the image restriction decision for copyright case ${input.noticeId}. Restoration will be processed separately.`
    case 'not_accepted':
      return `We could not accept the notice for copyright case ${input.noticeId}. You may file a new notice at /copyright/notices/new, contact /copyright/designated-agent, or seek judicial redress through a court.`
    case 'restriction_ended': {
      const outcome =
        input.restorationOutcome === 'visible'
          ? 'Restoration is authorized. The image will become visible again when restoration delivery completes.'
          : input.restorationOutcome === 'still_hidden'
            ? 'Another restriction keeps the image hidden.'
            : 'The image is unavailable.'
      return `The image restriction for copyright case ${input.noticeId} ended (${copyrightRestorationCauseText(input.restorationCause)}). ${outcome}`
    }
  }
}

export const copyrightNeedsInformationText =
  'We need more information before we can evaluate your copyright notice.'

export const copyrightStatementNotificationCopy = {
  claimant_decision_notice: {
    title: 'Copyright notice decision',
    body: 'Your copyright notice was decided. You may file a new notice at /copyright/notices/new, contact /copyright/designated-agent, or seek judicial redress through a court. Accepted cases show the reasons on the case page.',
  },
  poster_review_notice: {
    title: 'Copyright restriction reviewed',
    body: 'A person reviewed the restriction. See the case page for the decision and reasons.',
  },
  poster_restoration_notice: {
    title: 'Copyright restriction ended',
    body: 'This restriction ended. See the case page for the image availability and reasons.',
  },
}

function copyrightRestorationCauseText(cause: CopyrightStatementInput['restorationCause']): string {
  switch (cause) {
    case 'review_reversed':
      return 'human review reversed the decision'
    case 'appeal_reversed':
      return 'the appeal reversed the decision'
    case 'hold_resolved':
      return 'the legal hold was resolved'
    case 'counter_notice_window':
      return 'the counter-notice waiting period ended'
    default:
      throw new Error('Restoration cause is required')
  }
}

export function copyrightEmailSubject(kind: CopyrightDeliveryKind): string {
  switch (kind) {
    case 'email_intake_rejected':
      return 'We could not accept your copyright notice'
    case 'email_intake_needs_information':
    case 'staff_information_request':
      return 'More information is needed for your copyright notice'
    case 'email_intake_received':
    case 'claimant_receipt':
      return 'We received your copyright notice'
    case 'poster_review_notice':
      return 'Review of your copyright restriction'
    case 'poster_restoration_notice':
      return 'Your copyright restriction has ended'
    case 'claimant_decision_notice':
      return 'Decision on your copyright notice'
    case 'poster_restriction_notice':
      return 'Copyright notice affecting your material'
    case 'counter_notice_forwarding':
      return 'Counter-notice for your copyright claim'
    case 'status_update':
      return 'Update to your copyright case'
  }
}

export function copyrightNotificationCopy(
  deliveryKind:
    | 'claimant_receipt'
    | 'status_update'
    | 'poster_restriction_notice'
    | 'poster_review_notice'
    | 'poster_restoration_notice'
    | 'claimant_decision_notice',
): { title: string; body: string } {
  switch (deliveryKind) {
    case 'claimant_receipt':
      return { title: 'Copyright notice received', body: 'Your copyright notice was received.' }
    case 'claimant_decision_notice':
    case 'poster_review_notice':
    case 'poster_restoration_notice':
      return copyrightStatementNotificationCopy[deliveryKind]
    case 'poster_restriction_notice':
      return {
        title: 'Material restricted for a copyright notice',
        body: 'Review the case and available response options.',
      }
    case 'status_update':
      return { title: 'Copyright case update', body: 'There is an update to your copyright case.' }
  }
}
