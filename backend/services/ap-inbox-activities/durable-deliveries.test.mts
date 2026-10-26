import { describe, expect, it } from 'vitest'
import { createActivityPubInboxEnvelope } from '@voucha/test-helpers/activitypub-inbox-contract-fixtures'
import { getActivityPubInboxVerificationConstraintsForTest } from '@voucha/test-helpers'
import {
  acceptTestDelivery,
  loadTestDelivery,
  rejectTestDelivery,
  registerActivityPubInboxAdmission,
  verifyTestDelivery,
} from '@voucha/test-helpers/activitypub-inbox-transitions'
import { createRemoteActorFixture } from '@voucha/test-helpers/ap-inbox-activity-fixtures'

registerActivityPubInboxAdmission()

describe('durable ActivityPub inbox deliveries', () => {
  it('pairs verification timestamp and actor identity and restricts actor deletion', async () => {
    const constraints = await getActivityPubInboxVerificationConstraintsForTest()
    expect(
      constraints.find(
        constraint =>
          constraint.constraintName === 'activitypub_inbox_work_items__verified_actor_paired',
      )?.definition,
    ).toContain('(verified_at IS NULL) = (remote_actor_id IS NULL)')
    expect(
      constraints.find(
        constraint =>
          constraint.constraintName ===
          'activitypub_inbox_delivery_work_items_remote_actor_id_fkey',
      )?.deleteAction,
    ).toBe('RESTRICT')
    expect(
      constraints.find(
        constraint =>
          constraint.constraintName ===
          'activitypub_inbox_work_items__sender_requires_verification',
      )?.definition,
    ).toContain('sender_allowed_at IS NULL')
  })

  it('round-trips the exact signed request and records duplicate identity', async () => {
    const envelope = createActivityPubInboxEnvelope()
    const created = await acceptTestDelivery(envelope)
    const duplicate = await acceptTestDelivery(envelope)
    expect(duplicate).toEqual(created)
    expect(created.requestDigest).toMatch(/^[a-f0-9]{64}$/)
    const loaded = await loadTestDelivery(created.deliveryId)
    expect(loaded).toMatchObject(envelope)
    expect(loaded?.rawBody.equals(envelope.rawBody)).toBe(true)
    expect(loaded?.remoteActorId).toBeNull()
    expect(loaded?.verifiedAt).toBeNull()
    expect(loaded?.senderAllowedAt).toBeNull()
    expect(await rejectTestDelivery(created.deliveryId)).toBe(true)
  })

  it('retains the verified checkpoint across reads', async () => {
    const created = await acceptTestDelivery(createActivityPubInboxEnvelope())
    const actor = await createRemoteActorFixture()
    expect(await verifyTestDelivery(created.deliveryId, actor.id)).toBe(true)
    expect(await loadTestDelivery(created.deliveryId)).toMatchObject({ remoteActorId: actor.id })
  })
})
