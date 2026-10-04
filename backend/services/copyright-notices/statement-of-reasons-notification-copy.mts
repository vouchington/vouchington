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
    | 'claimant_decision_notice',
  jurisdiction: string = 'us_dmca',
): { title: string; body: string } {
  switch (deliveryKind) {
    case 'claimant_receipt':
      return { title: 'Copyright notice received', body: 'Your copyright notice was received.' }
    case 'claimant_decision_notice':
      return jurisdiction === 'us_dmca'
        ? copyrightStatementNotificationCopy.claimant_decision_notice
        : {
            title: 'Copyright notice decision',
            body: 'Your copyright notice was decided. The decision statement gives the reasons. You may seek judicial redress through a court.',
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
