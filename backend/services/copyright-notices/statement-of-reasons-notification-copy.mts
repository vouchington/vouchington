import { copyrightUsIntakeRoutesText } from './statement-of-reasons-redress-wording.mts'

const copyrightStatementNotificationCopy = {
  poster_review_notice: {
    title: 'Copyright restriction reviewed',
    body: 'A person reviewed the restriction. See the case page for the decision and reasons.',
  },
  poster_restoration_notice: {
    title: 'Copyright restriction ended',
    body: 'This restriction ended. See the case page for the image availability and reasons.',
  },
  owner_information_notice: {
    title: 'Community image restricted',
    body: 'An image on a community you own was withheld after a copyright notice.',
  },
}

export function copyrightNotificationCopy(
  deliveryKind:
    | 'claimant_receipt'
    | 'status_update'
    | 'poster_restriction_notice'
    | 'poster_review_notice'
    | 'poster_restoration_notice'
    | 'owner_information_notice'
    | 'claimant_decision_notice'
    | 'redress_decision_notice',
  jurisdiction: string = 'us_dmca',
): { title: string; body: string } {
  switch (deliveryKind) {
    case 'claimant_receipt':
      return { title: 'Copyright notice received', body: 'Your copyright notice was received.' }
    case 'claimant_decision_notice':
      return {
        title: 'Copyright notice decision',
        body: claimantDecisionNoticeBody(jurisdiction),
      }
    case 'redress_decision_notice':
      return {
        title: 'Copyright complaint decision',
        body: 'A person decided your complaint. See the case page for the disposition and reasons.',
      }
    case 'poster_review_notice':
    case 'poster_restoration_notice':
    case 'owner_information_notice':
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

/** The fallback in-app body when the stored statement is unavailable, by the notice's jurisdiction. */
function claimantDecisionNoticeBody(jurisdiction: string): string {
  const decided = 'Your copyright notice was decided.'
  if (jurisdiction === 'us_dmca')
    return `${decided} ${copyrightUsIntakeRoutesText()} Accepted cases show the reasons on the case page.`
  return jurisdiction === 'eu_dsa'
    ? `${decided} The decision statement gives the reasons. You may submit an internal complaint, refer the decision to a certified out-of-court dispute settlement body, or seek judicial redress through a court.`
    : `${decided} The decision statement gives the reasons. You may seek judicial redress through a court.`
}
