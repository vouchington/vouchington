import { describe, expect, it } from 'vitest'
import { decryptSecret } from '@modules/token-secrets'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { createTestUserDirect, softDeleteUser } from '@voucha/test-helpers'
import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { readCopyrightRetentionColumns } from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { readTestCopyrightRestrictionAdministratorLift } from '@voucha/test-helpers/copyright-administrator-lifts'
import { createTestLiftClaimantReceipt } from '@voucha/test-helpers/copyright-administrator-lift-fixtures'
import { confirmTestRepeatInfringerNotice } from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { useCopyrightRetentionConfig } from '@voucha/test-helpers/services/copyright-notices/retention-config'
import { sendAllCopyrightDeliveries } from '@voucha/test-helpers/services/copyright-notices/retention-deliveries'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  getCopyrightRepeatInfringerAccount,
  recordCopyrightRepeatInfringerDisposition,
} from './repeat-infringer-incidents.mts'
import { processCopyrightActionIntent, sweepCopyrightEvidenceRetention } from './index.mts'
import { liftCopyrightRestrictionWithoutSetter } from './restriction-lifts.mts'

describe('administrator copyright restriction lifts', () => {
  const configureRetention = useCopyrightRetentionConfig()
  useFakeCopyrightEvidenceBucket()
  it('lifts a confirmed post restriction after its author is deleted and retains the audit decision', async () => {
    await configureRetention({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const [poster, moderator, administrator] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect({ extraRoles: ['moderator'] }),
      createTestUserDirect({ administrator: true }),
    ])
    const noticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
    await createTestLiftClaimantReceipt(noticeId, `lift-${crypto.randomUUID()}@example.test`)
    const before = await getCopyrightNoticePrivateAggregate(noticeId)
    const restriction = before?.restrictions[0]
    const incident = (await getCopyrightRepeatInfringerAccount(poster.id)).incidents.find(
      row => row.copyright_notice_id === noticeId,
    )
    const withhold = before?.actionIntents.find(
      row => row.copyright_restriction_id === restriction?.id && row.action === 'withhold',
    )
    if (!restriction || !incident?.operative || !withhold)
      throw new Error('confirmed restriction fixture missing')

    await processCopyrightActionIntent(
      withhold.id,
      new Date(),
      createTestCopyrightDeliveryDependencies(async () => undefined),
    )
    await recordCopyrightRepeatInfringerDisposition({
      currentUser: moderator,
      incidentId: incident.id,
      disposition: 'withdrawn',
      rationale: `Account requested deletion ${crypto.randomUUID()}`,
      recordedAt: new Date(),
    })
    await softDeleteUser(poster.id)
    const rationale = `Verified deletion and ownerless target ${crypto.randomUUID()}`
    const liftedAt = new Date()
    const lift = await liftCopyrightRestrictionWithoutSetter({
      currentUser: administrator,
      noticeId,
      restrictionId: restriction.id,
      rationale,
      liftedAt,
    })

    const persisted = await readTestCopyrightRestrictionAdministratorLift(restriction.id)
    expect(persisted).toMatchObject({
      id: lift.id,
      copyright_restriction_id: restriction.id,
      lifted_at: liftedAt,
      lifted_by_id: administrator.id,
    })
    expect(persisted?.rationale_ciphertext).not.toContain(rationale)
    expect(
      decryptSecret(
        persisted!.rationale_ciphertext,
        `copyright-restriction-lift:${restriction.id}`,
      ),
    ).toBe(rationale)
    const after = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(after?.lifecycleEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'restriction_lifted_by_administrator',
          actor_user_id: administrator.id,
          copyright_restriction_id: restriction.id,
        }),
      ]),
    )
    expect(after?.actionIntents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ copyright_restriction_id: restriction.id, action: 'restore' }),
      ]),
    )
    const claimantReversals = (await readTestCopyrightStatementIntents(noticeId)).filter(
      row => row.delivery_kind === 'claimant_decision_notice' && row.text?.includes('reversed'),
    )
    expect(claimantReversals).toHaveLength(1)
    expect(claimantReversals[0]).toMatchObject({ channel: 'email', recipient_role: 'claimant' })
    const restore = after?.actionIntents.find(
      row => row.copyright_restriction_id === restriction.id && row.action === 'restore',
    )
    if (!restore) throw new Error('administrator restore intent missing')
    expect(after?.restrictions.find(row => row.id === restriction.id)?.lifted_at).toBeNull()
    await expect(
      processCopyrightActionIntent(
        restore.id,
        new Date(),
        createTestCopyrightDeliveryDependencies(async () => undefined),
      ),
    ).resolves.toBe('applied')
    expect(await getImagePlacementForCopyright(after!.targets[0]!.placement_id)).toMatchObject({
      withheld: false,
    })
    expect(
      (await getCopyrightNoticePrivateAggregate(noticeId))?.restrictions[0]?.lifted_at,
    ).not.toBeNull()
    expect(await getCopyrightRepeatInfringerAccount(poster.id)).toMatchObject({
      incidents: [expect.objectContaining({ copyright_notice_id: noticeId, operative: false })],
    })
    await sendAllCopyrightDeliveries(noticeId)
    const retentionBefore = await readCopyrightRetentionColumns(noticeId)
    await expect(
      sweepCopyrightEvidenceRetention({
        now: new Date('2028-01-01T00:00:00.000Z'),
        noticeIds: [noticeId],
      }),
    ).resolves.toMatchObject({ erased: 1, failed: [] })
    const erasedLift = (
      await readCopyrightRetentionColumns(noticeId)
    ).copyright_restriction_administrator_lifts?.find(row => row.id === lift.id)
    expect(retentionBefore.copyright_restriction_administrator_lifts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: lift.id, rationale_ciphertext: expect.any(String) }),
      ]),
    )
    expect(erasedLift?.rationale_ciphertext).toBe('erased')

    await expect(
      liftCopyrightRestrictionWithoutSetter({
        currentUser: administrator,
        noticeId,
        restrictionId: restriction.id,
        rationale: 'Duplicate lift attempt',
        liftedAt: new Date(),
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('refuses a live post author and a moderator before recording any lift', async () => {
    const [poster, moderator, administrator] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect({ extraRoles: ['moderator'] }),
      createTestUserDirect({ administrator: true }),
    ])
    const noticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    const restriction = aggregate?.restrictions[0]
    if (!restriction) throw new Error('confirmed restriction fixture missing')
    const input = {
      noticeId,
      restrictionId: restriction.id,
      rationale: 'No live account may respond to this restriction.',
      liftedAt: new Date(),
    }

    await expect(
      liftCopyrightRestrictionWithoutSetter({ currentUser: administrator, ...input }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      liftCopyrightRestrictionWithoutSetter({ currentUser: moderator, ...input }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(readTestCopyrightRestrictionAdministratorLift(restriction.id)).resolves.toBeNull()
  })
})
