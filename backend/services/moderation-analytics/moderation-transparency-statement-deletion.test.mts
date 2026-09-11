import { describe, expect, it, onTestFinished } from 'vitest'
import {
  acquireTestModerationTransparencyDateReservation,
  createTestUser,
  deleteTestModeratorActions,
  getTestModerationTransparencyRollupCount,
  insertTestModerationAppeal,
  insertTestModeratorAction,
  insertTestModeratorActions,
  insertTestUserWarning,
  resolveTestModerationAppeal,
  updateTestModeratorActionType,
} from '@voucha/test-helpers'

describe('moderation transparency statement deletion', () => {
  it('serializes concurrent reversed positive cohorts in canonical order', async () => {
    const occurredAt = await uniqueTransparencyNow()
    const [firstActor, secondActor] = await Promise.all([createTestUser(), createTestUser()])
    await Promise.all([
      insertTestModeratorActions({
        actorId: firstActor.id,
        actionTypes: ['pin', 'warn'],
        occurredAt,
        occurredAtSequenceStart: 0,
      }),
      insertTestModeratorActions({
        actorId: secondActor.id,
        actionTypes: ['warn', 'pin'],
        occurredAt,
        occurredAtSequenceStart: 100,
      }),
    ])
    await expectRollupCount(occurredAt, 'pin', 2)
    await expectRollupCount(occurredAt, 'warn', 2)
  })

  it('does not double count an immutable action no-op update', async () => {
    const occurredAt = await uniqueTransparencyNow()
    const actor = await createTestUser()
    const action = await insertTestModeratorAction({
      actorId: actor.id,
      actionType: 'pin',
      occurredAt,
    })
    await updateTestModeratorActionType(action.id, 'pin')
    await expectRollupCount(occurredAt, 'pin', 1)
  })

  it('does not double count a repeated appeal resolution update', async () => {
    const occurredAt = await uniqueTransparencyNow()
    const [staff, appellant] = await Promise.all([createTestUser(), createTestUser()])
    const warning = await insertTestUserWarning({ userId: appellant.id, issuedById: staff.id })
    const appeal = await insertTestModerationAppeal({
      appellantId: appellant.id,
      userWarningId: warning.id,
    })
    await resolveTestModerationAppeal({
      appealId: appeal.id,
      resolvedAt: occurredAt,
      resolutionAction: 'accept',
    })
    await resolveTestModerationAppeal({
      appealId: appeal.id,
      resolvedAt: occurredAt,
      resolutionAction: 'accept',
    })
    await expect(
      getTestModerationTransparencyRollupCount({
        occurredAt,
        metric: 'appeals',
        category: 'accept',
      }),
    ).resolves.toBe(1)
  })

  it('coalesces same-millisecond hard deletes by immutable cohort', async () => {
    const occurredAt = await uniqueTransparencyNow()
    const actor = await createTestUser()
    const actions = await Promise.all(
      ['pin', 'pin', 'warn', 'warn'].map((actionType, occurredAtSequence) =>
        insertTestModeratorAction({
          actorId: actor.id,
          actionType,
          occurredAt,
          occurredAtSequence,
        }),
      ),
    )
    await expectRollupCount(occurredAt, 'pin', 2)
    await expectRollupCount(occurredAt, 'warn', 2)

    await deleteTestModeratorActions(actions.map(action => action.id).reverse())

    await expectRollupCount(occurredAt, 'pin', undefined)
    await expectRollupCount(occurredAt, 'warn', undefined)
  })
})

async function expectRollupCount(
  occurredAt: Date,
  category: string,
  expected: number | undefined,
): Promise<void> {
  await expect(
    getTestModerationTransparencyRollupCount({
      occurredAt,
      metric: 'moderation_actions',
      category,
    }),
  ).resolves.toBe(expected)
}

async function uniqueTransparencyNow(): Promise<Date> {
  const reservation = await acquireTestModerationTransparencyDateReservation()
  onTestFinished(() => reservation.release())
  return reservation.now
}
