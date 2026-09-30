/**
 * Labels for the case-facing timeline events every viewer may receive. The API withholds all
 * other event types from members and case participants, so only staff can receive one of those;
 * they keep the plain event name.
 */
const caseFacingEventLabels = {
  notice_received: 'Notice received',
  provisional_restriction_imposed: 'Material provisionally restricted',
  placement_withheld: 'Material withheld',
  placement_restored: 'Material restored',
  appeal_received: 'Appeal received',
  appeal_reviewed: 'Appeal reviewed',
  counter_notice_received: 'Counter-notice received',
  counter_notice_reviewed: 'Counter-notice reviewed',
  withdrawal_received: 'Withdrawal received',
  court_or_ccb_hold_received: 'Court or Copyright Claims Board hold received',
} as const satisfies Record<string, string>

type CaseFacingEventType = keyof typeof caseFacingEventLabels

function isCaseFacingEventType(eventType: string): eventType is CaseFacingEventType {
  return Object.hasOwn(caseFacingEventLabels, eventType)
}

export function copyrightTimelineEventLabel(eventType: string): string {
  return isCaseFacingEventType(eventType)
    ? caseFacingEventLabels[eventType]
    : eventType.replaceAll('_', ' ')
}
