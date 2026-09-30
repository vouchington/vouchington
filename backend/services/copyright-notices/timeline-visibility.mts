/**
 * Audience decision record for the copyright case timeline.
 *
 * Every `copyright_notice_lifecycle_events.event_type` has exactly one entry: the audience allowed
 * to see that event.
 *
 * - `member`: any signed-in account reading the case, including its claimant and affected
 *   poster. Case-facing events only.
 * - `staff`: copyright reviewers, who also see every `member` event. Internal processing,
 *   delivery, replay, legal-hold, and guest-capability events stay here.
 *
 * Visibility is an allowlist: an event type with no entry here is invisible to members. A schema
 * test compares these keys with the database `event_type` CHECK, so a new event type cannot ship
 * without an audience decision.
 */
export type CopyrightTimelineAudience = 'member' | 'staff'

export const copyrightTimelineEventAudience = {
  // Case-facing: what happened to the case and to the hosted material.
  notice_received: 'member',
  provisional_restriction_imposed: 'member',
  placement_withheld: 'member',
  placement_restored: 'member',
  appeal_received: 'member',
  appeal_reviewed: 'member',
  counter_notice_received: 'member',
  counter_notice_reviewed: 'member',
  withdrawal_received: 'member',
  // Borderline: staff-only until an owner or counsel decides otherwise. A received court or CCB
  // hold explains to the poster why restoration did not happen, so a participant audience is the
  // likely follow-up.
  court_or_ccb_hold_received: 'staff',
  supplement_received: 'staff',
  counter_notice_deadline_started: 'staff',
  restoration_unavailable: 'staff',
  restoration_authorized_pending_delivery: 'staff',
  restriction_lifted_placement_retained: 'staff',
  // Internal review, evidence, and correspondence handling.
  submission_assessed: 'staff',
  mandatory_human_review_completed: 'staff',
  legal_hold_assessed: 'staff',
  legal_hold_resolved: 'staff',
  evidence_artifact_recorded: 'staff',
  outbound_correspondence_created: 'staff',
  agent_correspondence_approved: 'staff',
  email_correspondence_admitted: 'staff',
  email_correspondence_rejected: 'staff',
  // Internal delivery and replay plumbing.
  restoration_intent_created: 'staff',
  reversal_restoration_intent_created: 'staff',
  copyright_action_replayed: 'staff',
  delivery_intent_replayed: 'staff',
  media_delivery_registry_replayed: 'staff',
  // Guest capability administration.
  guest_capability_issued: 'staff',
  guest_capability_revoked: 'staff',
  guest_capability_revoked_by_withdrawal: 'staff',
} as const satisfies Record<string, CopyrightTimelineAudience>

type CopyrightLifecycleEventType = keyof typeof copyrightTimelineEventAudience

const decidedEventTypes = Object.keys(
  copyrightTimelineEventAudience,
) as CopyrightLifecycleEventType[]

/**
 * The event types an audience may read, or `null` for staff, who read the unfiltered timeline
 * (including any event type added after this record).
 */
export function copyrightTimelineEventTypesFor(
  audience: CopyrightTimelineAudience,
): CopyrightLifecycleEventType[] | null {
  if (audience === 'staff') return null
  return decidedEventTypes.filter(
    eventType => copyrightTimelineEventAudience[eventType] === audience,
  )
}
