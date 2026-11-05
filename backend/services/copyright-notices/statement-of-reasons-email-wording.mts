import type { CopyrightDeliveryKind } from './delivery-types.mts'
import { copyrightUsIntakeRoutesText } from './statement-of-reasons-redress-wording.mts'

export const copyrightNeedsInformationText =
  'We need more information before we can evaluate your copyright notice.'

const copyrightEmailSubjects: Record<CopyrightDeliveryKind, string> = {
  email_intake_rejected: 'We could not accept your copyright notice',
  email_intake_needs_information: 'More information is needed for your copyright notice',
  staff_information_request: 'More information is needed for your copyright notice',
  email_intake_received: 'We received your copyright notice',
  claimant_receipt: 'We received your copyright notice',
  poster_review_notice: 'Review of your copyright restriction',
  poster_restoration_notice: 'Your copyright restriction has ended',
  owner_information_notice: 'Copyright notice affecting your community image',
  claimant_decision_notice: 'Decision on your copyright notice',
  redress_decision_notice: 'Decision on your copyright complaint',
  poster_restriction_notice: 'Your image was restricted after a copyright notice',
  counter_notice_forwarding: 'Counter-notice for your copyright claim',
  status_update: 'Update to your copyright case',
}

export function copyrightEmailSubject(kind: CopyrightDeliveryKind): string {
  return copyrightEmailSubjects[kind]
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
