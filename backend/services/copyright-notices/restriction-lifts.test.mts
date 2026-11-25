import { readTestRepeatInfringerIncidents } from '@voucha/test-helpers/copyright-repeat-infringer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { decryptSecret } from '@modules/token-secrets'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { createTestUserDirect, softDeleteUser } from '@voucha/test-helpers'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { readTestCopyrightRestrictionAdministratorLift } from '@voucha/test-helpers/copyright-administrator-lifts'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import { readTestCopyrightPlacementParties } from '@voucha/test-helpers/copyright-placement-policy-boundaries'
import { createTestLiftClaimantReceipt } from '@voucha/test-helpers/copyright-administrator-lift-fixtures'
import { confirmTestRepeatInfringerNotice } from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { recordCopyrightRepeatInfringerDisposition } from './repeat-infringer-incidents.mts'
import { processCopyrightActionIntent } from './index.mts'
import { liftCopyrightRestrictionWithoutSetter } from './restriction-lifts.mts'

describe('administrator copyright restriction lifts', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('records one administrator lift when two sessions restore an ownerless restriction', async () => {
    const [poster, moderator, administrator] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect({ extraRoles: ['moderator'] }),
      createTestUserDirect({ administrator: true }),
    ])
    const noticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
    await createTestLiftClaimantReceipt(noticeId, `lift-${crypto.randomUUID()}@example.test`)
    const before = await getCopyrightNoticePrivateAggregate(noticeId)
    const restriction = before?.restrictions[0]
    const incident = (await readTestRepeatInfringerIncidents(poster.id)).find(
      row => row.copyright_notice_id === noticeId,
    )
    const withhold = before?.actionIntents.find(
      row => row.copyright_restriction_id === restriction?.id && row.action === 'withhold',
    )
    if (!restriction || !incident?.is_operative || !withhold)
      throw new Error('confirmed restriction fixture missing')

    await processCopyrightActionIntent(withhold.id, new Date())
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
    const input = {
      currentUser: administrator,
      noticeId,
      restrictionId: restriction.id,
      rationale,
      liftedAt,
    }
    const { lift, competingLift } = await raceAdministratorLifts(input)
    expect(competingLift).toMatchObject({ status: 'rejected', reason: { status: 409 } })
    await expect(
      readTestCopyrightPlacementParties(restriction.copyright_notice_target_id, 'respond'),
    ).resolves.toEqual([])

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
    if (!after) throw new Error('copyright case missing after administrator lift')
    expect(
      after.lifecycleEvents.filter(
        event => event.change_type === 'restriction_lifted_by_administrator',
      ),
    ).toEqual([
      expect.objectContaining({
        changed_by_id: administrator.id,
        copyright_restriction_id: restriction.id,
      }),
    ])
    const restoreIntents = after.actionIntents.filter(intent => intent.action === 'restore')
    expect(restoreIntents).toEqual([
      expect.objectContaining({ copyright_restriction_id: restriction.id }),
    ])
    const claimantReversals = (await readTestCopyrightStatementIntents(noticeId)).filter(
      row => row.delivery_kind === 'claimant_decision_notice' && row.text?.includes('reversed'),
    )
    expect(claimantReversals).toHaveLength(1)
    expect(claimantReversals[0]).toMatchObject({ channel: 'email', recipient_role: 'claimant' })
    const [restore] = restoreIntents
    if (!restore) throw new Error('administrator restore intent missing')
    expect(after.restrictions.find(row => row.id === restriction.id)?.lifted_at).toBeNull()
    await expect(processCopyrightActionIntent(restore.id, new Date())).resolves.toBe('applied')
    expect(await getImagePlacementForCopyright(after.targets[0]!.placement_id)).toMatchObject({
      withheld: false,
    })
    expect(
      (await getCopyrightNoticePrivateAggregate(noticeId))?.restrictions[0]?.lifted_at,
    ).not.toBeNull()
    expect(await readTestRepeatInfringerIncidents(poster.id)).toEqual([
      expect.objectContaining({ copyright_notice_id: noticeId, is_operative: false }),
    ])
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
      readTestCopyrightPlacementParties(restriction.copyright_notice_target_id, 'respond'),
    ).resolves.toEqual([poster.id])
    await expect(
      liftCopyrightRestrictionWithoutSetter({ currentUser: moderator, ...input }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(readTestCopyrightRestrictionAdministratorLift(restriction.id)).resolves.toBeNull()
  })
})

async function raceAdministratorLifts(
  input: Parameters<typeof liftCopyrightRestrictionWithoutSetter>[0],
) {
  let contender: Promise<[PromiseSettledResult<{ id: string }>]> | undefined
  try {
    const { result: lift } = await observeTestPostgresClientQueries(
      () => liftCopyrightRestrictionWithoutSetter(input),
      async query => {
        if (
          contender ||
          !query.text.includes('/* liftCopyrightRestrictionWithoutSetter:current */') ||
          !query.values.includes(input.restrictionId)
        )
          return
        // The first decision is uncommitted when the second session enters the same case.
        const started = Promise.withResolvers<void>()
        const restore = beforePostgresTransactionQueryForTest(
          '/* lockCopyrightActionGenerationForWrite */',
          values => values.includes(input.noticeId),
          async () => started.resolve(),
        )
        try {
          contender = Promise.allSettled([
            liftCopyrightRestrictionWithoutSetter({ ...input, rationale: 'Concurrent lift' }),
          ] as const)
          await Promise.race([
            started.promise,
            contender.then(() => {
              throw new Error('Contending lift ended before reaching case admission')
            }),
          ])
        } finally {
          restore()
        }
      },
    )
    if (!contender) throw new Error('First lift did not reach its decision write')
    const [competingLift] = await contender
    return { lift, competingLift }
  } finally {
    await contender
  }
}
