import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestMembershipGrant,
  getTestGrantQueue,
  getTestMembershipEntitlementEffects,
  getTestMembershipEntitlementEffectsForGrant,
  runTestActionAfterMembershipUserLock,
  setTestMembershipGrantRemainingMilliseconds,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { createMembership, grantMembership } from '../create.mts'
import { getMembershipByUserId, getMembershipHistory } from '../get.mts'
import { CompletedMembershipGrantError, revokeMembershipGrant } from './revoke.mts'

describe('revokeMembershipGrant', () => {
  it.each([
    ['empty', ''],
    ['reason longer than 1000 characters', 'x'.repeat(1001)],
  ])('rejects a %s revocation reason', async (_description, reason) => {
    await expect(revokeMembershipGrant('admin-id', 'grant-id', reason)).rejects.toThrow(
      'Revocation reason must be 1-1000 characters',
    )
  })

  it('revokes a queued grant without changing the active projection and returns its stored result on replay', async () => {
    const grantor = await createTestUser({ administrator: true })
    const revoker = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const activeSku = await createTestSku({ plan: 'plus' })
    await grantMembership(grantor.id, member.id, 'plus', activeSku.id, 30)
    const queuedSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    await grantMembership(grantor.id, member.id, 'pro', queuedSku.id, 31)
    const [, queuedGrantId] = (await getTestGrantQueue(member.id)).grant_ids
    expect(queuedGrantId).toBeDefined()
    const beforeHistory = await getMembershipHistory(member.id)

    const revoked = await revokeMembershipGrant(revoker.id, queuedGrantId!, 'incorrect grant')

    expect(revoked).toMatchObject({
      grantId: queuedGrantId,
      userId: member.id,
      alreadyRevoked: false,
      activatedNextGrant: false,
    })
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      plan: 'plus',
      status: 'active',
    })
    await expect(getMembershipHistory(member.id)).resolves.toEqual(beforeHistory)
    await expect(getTestMembershipGrant(queuedGrantId!)).resolves.toMatchObject({
      revoked_by_id: revoker.id,
      revocation_reason: 'incorrect grant',
      source_cancelled_at: revoked?.revokedAt,
    })

    const replayed = await revokeMembershipGrant(grantor.id, queuedGrantId!, 'different reason')

    expect(replayed).toMatchObject({
      grantId: queuedGrantId,
      userId: member.id,
      alreadyRevoked: true,
      activatedNextGrant: false,
      revokedAt: revoked?.revokedAt,
    })
    await expect(getTestMembershipGrant(queuedGrantId!)).resolves.toMatchObject({
      revoked_by_id: revoker.id,
      revocation_reason: 'incorrect grant',
    })
  })

  it('dispatches elapsed entitlement effects when replaying an already revoked grant', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const activeSku = await createTestSku({ plan: 'plus' })
    const active = await grantMembership(admin.id, member.id, 'plus', activeSku.id, 30)
    const queuedSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    await grantMembership(admin.id, member.id, 'pro', queuedSku.id, 30)
    const [, queuedGrantId] = (await getTestGrantQueue(member.id)).grant_ids
    expect(queuedGrantId).toBeDefined()
    await revokeMembershipGrant(admin.id, queuedGrantId!, 'revoke before replay')
    await updateTestMembershipExpiresAt(active.id, new Date('2020-01-01T00:00:00.000Z'))
    const enqueueEntitlementEffects = vi.fn<() => void>()

    const replayed = await revokeMembershipGrant(
      admin.id,
      queuedGrantId!,
      'replayed reason is retained',
      { enqueueDeliverMembershipEntitlementEffects: enqueueEntitlementEffects },
    )

    expect(replayed).toMatchObject({ alreadyRevoked: true })
    expect(enqueueEntitlementEffects).toHaveBeenCalledOnce()
    await expect(getMembershipHistory(member.id)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ change_type: 'expiration' })]),
    )
  })

  it('revokes an active grant after a direct term supersedes its projection', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    const grant = await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
    const directSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const subscriptionId = `sub_revoke_superseded_${randomUUID()}`
    await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: subscriptionId,
    })
    const effectsBeforeRevocation = await getTestMembershipEntitlementEffectsForGrant(grant.grantId)

    const revoked = await revokeMembershipGrant(admin.id, grant.grantId, 'grant no longer applies')

    expect(revoked).toMatchObject({
      grantId: grant.grantId,
      alreadyRevoked: false,
      activatedNextGrant: false,
    })
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      plan: 'pro',
      status: 'active',
      stripe_subscription_id: subscriptionId,
    })
    await expect(getTestMembershipGrant(grant.grantId)).resolves.toMatchObject({
      activation_ended_at: expect.any(Date),
      revoked_by_id: admin.id,
      revocation_reason: 'grant no longer applies',
      source_cancelled_at: expect.any(Date),
    })
    await expect(getMembershipHistory(member.id)).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          change_type: 'admin_revoke',
          membership_grant_id: grant.grantId,
        }),
      ]),
    )
    await expect(getTestMembershipEntitlementEffectsForGrant(grant.grantId)).resolves.toEqual(
      effectsBeforeRevocation,
    )
  })

  it('serializes concurrent revocations with one durable revocation time', async () => {
    const firstAdmin = await createTestUser({ administrator: true })
    const secondAdmin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const grant = await grantMembership(firstAdmin.id, member.id, 'plus', sku.id, 30)

    const results = await Promise.all([
      revokeMembershipGrant(firstAdmin.id, grant.grantId, 'first revocation'),
      revokeMembershipGrant(secondAdmin.id, grant.grantId, 'second revocation'),
    ])

    const winnerIndex = results.findIndex(result => !result?.alreadyRevoked)
    const [winner] = results.filter(result => !result?.alreadyRevoked)
    const [replay] = results.filter(result => result?.alreadyRevoked)
    if (!winner || !replay) throw new Error('Expected one revocation winner and one replay')
    expect(replay.revokedAt).toEqual(winner.revokedAt)
    const persisted = (await getTestMembershipGrant(grant.grantId))!
    expect(persisted).toMatchObject({
      revoked_at: winner.revokedAt,
      revoked_by_id: winnerIndex === 0 ? firstAdmin.id : secondAdmin.id,
    })
    expect(persisted.activation_started_at!.getTime()).toBeLessThanOrEqual(
      persisted.revoked_at!.getTime(),
    )
    expect(persisted.source_cancelled_at!.getTime()).toBeGreaterThanOrEqual(
      persisted.source_effective_at.getTime(),
    )
  })

  it('records revocation time after the recipient lock is released', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const grant = await grantMembership(admin.id, member.id, 'plus', sku.id, 30)

    const { releasedAt, result } = await runTestActionAfterMembershipUserLock(member.id, () =>
      revokeMembershipGrant(admin.id, grant.grantId, 'revoke after lock'),
    )

    expect(result).toMatchObject({ grantId: grant.grantId, alreadyRevoked: false })
    expect(result!.revokedAt.getTime()).toBeGreaterThanOrEqual(releasedAt.getTime() - 50)
  })

  it('closes the active grant and promotes the next FIFO grant', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const firstSku = await createTestSku({ plan: 'plus' })
    await grantMembership(admin.id, member.id, 'plus', firstSku.id, 30)
    const secondSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    await grantMembership(admin.id, member.id, 'pro', secondSku.id, 31)
    const queue = await getTestGrantQueue(member.id)
    const [firstGrantId] = queue.grant_ids
    expect(firstGrantId).toBeDefined()

    const revoked = await revokeMembershipGrant(admin.id, firstGrantId!, 'duplicate grant')

    expect(revoked).toMatchObject({
      grantId: firstGrantId,
      userId: member.id,
      alreadyRevoked: false,
      activatedNextGrant: true,
    })
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      plan: 'pro',
      status: 'active',
    })
    const history = await getMembershipHistory(member.id)
    const revocation = history.find(change => change.change_type === 'admin_revoke')
    const successor = history.find(
      change => change.change_type === 'admin_grant' && change.to_sku_id === secondSku.id,
    )
    if (!revocation || !successor) throw new Error('Expected revocation and successor changes')
    expect(revocation).toMatchObject({ note: 'duplicate grant' })
    await expect(
      Promise.all(
        [revocation, successor].map(change => getTestMembershipEntitlementEffects(change.id)),
      ),
    ).resolves.toEqual([
      [expect.objectContaining({ membership_change_id: revocation.id, user_id: member.id })],
      [expect.objectContaining({ membership_change_id: successor.id, user_id: member.id })],
    ])
  })

  it('wakes the expiration outbox but creates no revoke change for a completed revocation', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const directSku = await createTestSku({ plan: 'plus' })
    const active = await grantMembership(admin.id, member.id, 'plus', directSku.id, 30)
    const queuedSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    await grantMembership(admin.id, member.id, 'pro', queuedSku.id, 1)
    const [, queuedGrantId] = (await getTestGrantQueue(member.id)).grant_ids
    expect(queuedGrantId).toBeDefined()
    await setTestMembershipGrantRemainingMilliseconds(queuedGrantId!, 0.5)
    const before = await getMembershipHistory(member.id)
    await updateTestMembershipExpiresAt(active.id, new Date('2020-01-01T00:00:00.000Z'))

    await expect(
      revokeMembershipGrant(admin.id, queuedGrantId!, 'too late'),
    ).rejects.toBeInstanceOf(CompletedMembershipGrantError)
    const history = await getMembershipHistory(member.id)
    expect(history).toHaveLength(before.length + 1)
    const expiration = history.find(change => change.change_type === 'expiration')
    expect(expiration).toBeDefined()
    await expect(getTestMembershipEntitlementEffects(expiration!.id)).resolves.toHaveLength(1)
    expect(history).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ change_type: 'admin_revoke' })]),
    )
  })
})
