import type { CopyrightDeliveryKind } from './delivery-types.mts'
import { copyrightStatementLegalGround } from './statement-of-reasons-legal-ground.mts'
import type {
  CopyrightStatementInput,
  CopyrightStatementFields,
} from './statement-of-reasons-types.mts'

export { copyrightNotificationCopy } from './statement-of-reasons-notification-copy.mts'

export const COPYRIGHT_AI_ASSISTED_SENTENCE = 'Automated tools assisted with processing this case.'

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
    ? 'A global image visibility restriction is authorized. Delivery of that restriction withholds the image from visibility globally. This restriction does not delete the image. The restriction continues until review or the applicable restoration process ends it.'
    : ''
  const automation =
    fields.automation.decision === 'automatic_deadline'
      ? 'The restriction ended automatically when the counter-notice waiting period expired.'
      : fields.automation.decision === 'automatic_pending_review'
        ? 'The provisional restriction was imposed automatically. A person will review it.'
        : 'A person made this decision.'
  const assistance = input.aiGuidance
    ? COPYRIGHT_AI_ASSISTED_SENTENCE
    : 'Automated tools did not assist with processing this case.'
  const legal = copyrightStatementLegalGround(input.jurisdiction).text
  const explainableEvent =
    input.event === 'restricted' || input.event === 'confirmed' || input.event === 'not_accepted'
  const explanation =
    input.jurisdiction !== 'us_dmca' && explainableEvent && input.explanation
      ? `Public explanation: ${input.explanation}`
      : ''
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
    explanation,
    redress,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function copyrightStatementSummary(input: CopyrightStatementInput): string {
  switch (input.event) {
    case 'restricted':
      return input.audience === 'claimant'
        ? `Your copyright notice resulted in authorization of an image restriction for case ${input.noticeId}. The reasons and redress routes are included in this notice.`
        : `An image restriction was authorized for copyright case ${input.noticeId}. See the case page for the reasons and redress routes.`
    case 'confirmed':
      return input.audience === 'claimant'
        ? `A person confirmed the image restriction for your copyright case ${input.noticeId}. The reasons and redress routes are included in this notice.`
        : `A person confirmed the image restriction for copyright case ${input.noticeId}. See the case page for the reasons and redress routes.`
    case 'reversed':
      return `A person reversed the image restriction decision for copyright case ${input.noticeId}. Restoration will be processed separately.`
    case 'not_accepted':
      if (input.jurisdiction !== 'us_dmca')
        return `We decided not to restrict the material for copyright case ${input.noticeId}. You may seek judicial redress through a court.`
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

function copyrightRestorationCauseText(cause: CopyrightStatementInput['restorationCause']): string {
  switch (cause) {
    case 'review_reversed':
      return 'human review reversed the decision'
    case 'appeal_reversed':
      return 'the appeal reversed the decision'
    case 'hold_resolved':
      return 'the legal hold was resolved'
    case 'administrator_lift':
      return 'an administrator lifted the restriction after review'
    case 'complaint_reversed':
      return 'a complaint reversed the decision'
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
    case 'owner_information_notice':
      return 'Copyright notice affecting your community image'
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

/** Unpromoted intake has neither a copyright case nor an established legal ground. */
export function copyrightIntakeRejectionText(receivedAt: Date, aiGuidance: boolean): string {
  return [
    'We could not accept your emailed copyright notice. No copyright case was opened.',
    `This response concerns the email received ${receivedAt.toISOString()}. A person made this intake decision.`,
    aiGuidance
      ? 'Automated tools assisted with processing this email.'
      : 'Automated tools did not assist with processing this email.',
    'You may file a new notice at /copyright/notices/new, contact /copyright/designated-agent, or seek judicial redress through a court.',
  ].join('\n\n')
}
