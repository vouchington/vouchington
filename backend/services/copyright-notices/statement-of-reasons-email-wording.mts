import type { CopyrightDeliveryKind } from './delivery-types.mts'
import { copyrightUsIntakeRoutesText } from './statement-of-reasons-redress-wording.mts'

export const copyrightNeedsInformationText =
  'We need more information before we can evaluate your copyright notice.'

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
    case 'redress_decision_notice':
      return 'Decision on your copyright complaint'
    case 'poster_restriction_notice':
      return 'Your image was restricted after a copyright notice'
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
    copyrightUsIntakeRoutesText(),
  ].join('\n\n')
}
