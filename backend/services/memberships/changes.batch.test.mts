import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestMembership,
  createTestSku,
  createTestUnprojectedStripeProductionProviderObservation,
  createTestUser,
  getTestMembershipChangeReferences,
  getTestMembershipEntitlementEffects,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import { getMembershipHistory } from './get.mts'
import { grantMembership } from './create.mts'
import { recordMembershipChange, recordMembershipChanges } from './changes.mts'

describe('recordMembershipChanges', () => {
  it('skips a duplicate Stripe event without changing its pointer or recording an effect', async () => {
    const administrator = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const otherMember = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    const upgradedSku = await createTestSku({
      plan: 'pro',
      provider_environment: 'production',
      provider_application_id: `batch-${randomUUID()}`,
    })
    const grant = await grantMembership(administrator.id, member.id, 'plus', grantSku.id)
    const memberMembership = await getTestMembershipRaw(grant.id)
    if (!memberMembership) throw new Error('Expected the membership grant projection')
    const otherMembership = await createTestMembership({ user_id: otherMember.id })
    const duplicateStripeEventId = `evt_batch_${randomUUID()}`
    const skippedNote = `batch-skipped-${randomUUID()}`
    await recordMembershipChange({
      membershipId: otherMembership.id,
      userId: otherMember.id,
      changeType: 'renewal',
      stripeEventId: duplicateStripeEventId,
      note: `batch-seed-${randomUUID()}`,
    })
    const otherPointerBefore = (await getTestMembershipRaw(otherMembership.id))?.latest_change_id
    if (!otherPointerBefore) throw new Error('Expected the seed change pointer')

    const providerApplicationId = upgradedSku.provider_application_id
    const evidence = await createTestUnprojectedStripeProductionProviderObservation({
      applicationId: providerApplicationId,
      membershipProductId: upgradedSku.id,
      membershipProviderProductId: upgradedSku.membership_provider_product_id,
      userId: member.id,
    })
    const at = new Date('2026-10-01T12:00:00.000Z')
    const notes = [
      `batch-first-${randomUUID()}`,
      `batch-second-${randomUUID()}`,
      `batch-third-${randomUUID()}`,
    ]
    const recordedStripeEventId = `evt_batch_${randomUUID()}`
    const changes = [
      {
        membershipId: grant.id,
        userId: member.id,
        changeType: 'upgrade' as const,
        fromSkuId: grantSku.id,
        toSkuId: upgradedSku.id,
        changedById: administrator.id,
        note: notes[0],
        stripeEventId: recordedStripeEventId,
        membershipProviderEvidenceId: evidence.membership_provider_evidence_record_id,
        cancelledAt: at,
        cancelAtPeriodEnd: true,
      },
      {
        membershipId: grant.id,
        userId: member.id,
        membershipSourceId: memberMembership.membership_source_id,
        membershipGrantId: grant.grantId,
        changeType: 'pause' as const,
        fromSkuId: upgradedSku.id,
        note: notes[1],
        pausedAt: at,
      },
      {
        membershipId: grant.id,
        userId: member.id,
        changeType: 'renewal' as const,
        note: notes[2],
        pastDueAt: at,
      },
      {
        membershipId: otherMembership.id,
        userId: otherMember.id,
        changeType: 'renewal' as const,
        stripeEventId: duplicateStripeEventId,
        note: skippedNote,
        expiredAt: at,
      },
    ]

    await using transaction = await beginTransaction()
    const results = await recordMembershipChanges(changes, {
      ignoreDuplicateStripeEvent: true,
      query: transaction,
    })
    await transaction.commit()

    expect(results).toEqual([true, true, true, false])
    const memberChanges = (await getMembershipHistory(member.id)).results.filter(change =>
      notes.includes(change.note ?? ''),
    )
    expect(memberChanges).toHaveLength(notes.length)
    expect(
      memberChanges
        .map(change => change.note)
        .toSorted((left, right) => (left ?? '').localeCompare(right ?? '')),
    ).toEqual(notes.toSorted((left, right) => left.localeCompare(right)))
    expect(memberChanges.find(change => change.note === notes[0])).toMatchObject({
      change_type: 'upgrade',
      from_sku_id: grantSku.id,
      to_sku_id: upgradedSku.id,
      changed_by_id: administrator.id,
      stripe_event_id: recordedStripeEventId,
      membership_provider_evidence_record_id: evidence.membership_provider_evidence_record_id,
      cancelled_at: at,
      should_cancel_at_period_end: true,
    })
    expect(memberChanges.find(change => change.note === notes[1])).toMatchObject({
      change_type: 'pause',
      from_sku_id: upgradedSku.id,
      paused_at: at,
    })
    expect(memberChanges.find(change => change.note === notes[2])).toMatchObject({
      change_type: 'renewal',
      past_due_at: at,
      should_cancel_at_period_end: false,
    })

    const firstChange = memberChanges.find(change => change.note === notes[0])!
    const secondChange = memberChanges.find(change => change.note === notes[1])!
    const [firstReferences, secondReferences] = await Promise.all([
      getTestMembershipChangeReferences(firstChange.id),
      getTestMembershipChangeReferences(secondChange.id),
    ])
    expect(firstReferences).toEqual({
      membership_source_id: memberMembership.membership_source_id,
      membership_grant_id: grant.grantId,
    })
    expect(secondReferences).toEqual(firstReferences)

    const newest = [...memberChanges]
      .toSorted(
        (left, right) =>
          left.created_at.getTime() - right.created_at.getTime() || left.id.localeCompare(right.id),
      )
      .at(-1)!
    expect((await getTestMembershipRaw(grant.id))?.latest_change_id).toBe(newest.id)
    expect(
      await Promise.all(
        memberChanges.map(change => getTestMembershipEntitlementEffects(change.id)),
      ),
    ).toEqual(
      memberChanges.map(change => [
        expect.objectContaining({
          membership_change_id: change.id,
          user_id: member.id,
        }),
      ]),
    )

    const otherChanges = (await getMembershipHistory(otherMember.id)).results
    expect(otherChanges.some(change => change.note === skippedNote)).toBe(false)
    expect((await getTestMembershipRaw(otherMembership.id))?.latest_change_id).toBe(
      otherPointerBefore,
    )
    const seededChange = otherChanges.find(
      change => change.stripe_event_id === duplicateStripeEventId,
    )!
    expect(await getTestMembershipEntitlementEffects(seededChange.id)).toHaveLength(1)
  })

  it('records an expiration-only batch with an effect and latest pointer per membership', async () => {
    const members = await Promise.all([createTestUser(), createTestUser()])
    const memberships = await Promise.all(
      members.map(member => createTestMembership({ user_id: member.id })),
    )
    const expiredAt = new Date('2026-10-02T12:00:00.000Z')

    const results = await recordMembershipChanges(
      memberships.map((membership, index) => ({
        membershipId: membership.id,
        userId: members[index]!.id,
        membershipSourceId: membership.membership_source_id,
        changeType: 'expiration' as const,
        fromSkuId: membership.sku_id,
        expiredAt,
      })),
    )

    expect(results).toEqual([true, true])
    for (const [index, membership] of memberships.entries()) {
      const change = (await getMembershipHistory(members[index]!.id)).results[0]!
      expect(change).toMatchObject({
        membership_id: membership.id,
        change_type: 'expiration',
        from_sku_id: membership.sku_id,
        expired_at: expiredAt,
      })
      expect((await getTestMembershipRaw(membership.id))?.latest_change_id).toBe(change.id)
      expect(await getTestMembershipEntitlementEffects(change.id)).toHaveLength(1)
    }
  })
})
