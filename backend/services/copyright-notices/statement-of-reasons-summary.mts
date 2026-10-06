import {
  COPYRIGHT_COURT_REDRESS_TEXT,
  copyrightUsIntakeRoutesText,
} from './statement-of-reasons-redress-wording.mts'
import type { CopyrightStatementInput } from './statement-of-reasons-types.mts'

/**
 * The first paragraph of every statement. The email carries the full statement and the in-app
 * notice links to the case, so neither paragraph points the reader at the case page for reasons.
 */
export function copyrightStatementSummary(input: CopyrightStatementInput): string {
  switch (input.event) {
    case 'restricted':
      return input.audience === 'claimant'
        ? `Your copyright notice resulted in authorization of an image restriction for case ${input.noticeId}. The reasons and redress routes are included in this notice.`
        : `An image restriction was authorized for copyright case ${input.noticeId}.`
    case 'confirmed':
      return input.audience === 'claimant'
        ? `A person confirmed the image restriction for your copyright case ${input.noticeId}. The reasons and redress routes are included in this notice.`
        : `A person confirmed the image restriction for copyright case ${input.noticeId}.`
    case 'reversed':
      return `A person reversed the image restriction decision for copyright case ${input.noticeId}. Restoration will be processed separately.`
    case 'not_accepted':
      return copyrightNotAcceptedSummary(input)
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

function copyrightNotAcceptedSummary(input: CopyrightStatementInput): string {
  if (input.jurisdiction === 'us_dmca')
    return `We could not accept the notice for copyright case ${input.noticeId}. ${copyrightUsIntakeRoutesText()}`
  const decision = `We decided not to restrict the material for copyright case ${input.noticeId}.`
  return input.jurisdiction === 'eu_dsa'
    ? `${decision} You may submit an internal complaint, refer the decision to a certified out-of-court dispute settlement body, or seek judicial redress through a court.`
    : `${decision} ${COPYRIGHT_COURT_REDRESS_TEXT}`
}

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
