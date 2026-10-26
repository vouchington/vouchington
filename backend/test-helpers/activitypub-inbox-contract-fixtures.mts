import { randomUUID } from 'node:crypto'
import type { ExpectStatic } from 'vitest'
import type { ActivityPubInboxEnvelope } from '../services/ap-inbox-activities/durable-delivery-transition-contract.mts'
import type { getActivityPubInboxVerificationConstraintsForTest } from './entities/activitypub-inbox.mts'

export function createActivityPubInboxEnvelope(): ActivityPubInboxEnvelope {
  const suffix = randomUUID()
  const actor = `https://${suffix}.example/users/alice`
  return {
    requestMethod: 'POST',
    requestTarget: `/ap/inbox?delivery=${suffix}`,
    expectedHost: 'voucha.example',
    signatureHeader: `keyId="${actor}#main-key",headers="(request-target) host date digest",signature="bytes"`,
    digestHeader: 'SHA-256=exact-digest',
    dateHeader: 'Thu, 01 Jan 2026 00:00:00 GMT',
    contentTypeHeader: 'application/activity+json',
    rawBody: Buffer.from([0, 1, 2, 255]),
    claimedActivityId: `${actor}/activities/${suffix}`,
    claimedActivityType: 'Create',
    claimedActorUri: actor,
    senderHostname: `${suffix}.example`,
  }
}
export function expectActivityPubInboxVerificationConstraints(
  constraints: Awaited<ReturnType<typeof getActivityPubInboxVerificationConstraintsForTest>>,
  check: ExpectStatic,
): void {
  check(
    constraints.some(
      constraint =>
        constraint.constraintName === 'activitypub_inbox_work_items__verified_actor_paired' &&
        constraint.definition.includes('(verified_at IS NULL) = (remote_actor_id IS NULL)'),
    ),
  ).toBe(true)
  check(
    constraints.find(
      constraint =>
        constraint.constraintName === 'activitypub_inbox_delivery_work_items_remote_actor_id_fkey',
    )?.deleteAction,
  ).toBe('RESTRICT')
  check(
    constraints.find(
      constraint =>
        constraint.constraintName === 'activitypub_inbox_work_items__sender_requires_verification',
    )?.definition,
  ).toContain('sender_allowed_at IS NULL')
  check(
    constraints.find(
      constraint =>
        constraint.constraintName === 'activitypub_inbox_work_items__terminal_diagnostics_present',
    )?.definition,
  ).toContain('last_error IS NOT NULL')
}
