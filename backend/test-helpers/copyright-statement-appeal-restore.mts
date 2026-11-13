import { createStatementAppealScene } from './copyright-statement-appeal-scenes.mts'
import { seedEffectiveAppealDecision } from './copyright-effective-review-decisions.mts'
import { seedCompletedReversalStatement } from './copyright-restored-statement-fixture.mts'
import { readTestCopyrightStatementIntents } from './copyright-statement-notices.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { getImagePlacementForCopyright } from '../services/images/placements.mts'
import { expect } from 'vitest'
import { processCopyrightActionIntent } from '../services/copyright-notices/action-delivery-process.mts'
import {
  readDeliveryContractState,
  claimedDeliveryState,
  terminalDeliveryState,
  type DeliveryContractOwner,
} from './copyright-action-delivery-contract-state.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
export async function assertStatementAppealRestore(
  input: DeliveryContractOwner,
  intentId: string,
  now = new Date(),
) {
  const before = await readDeliveryContractState(input)
  // Topic assets have no personal notifier under the immutable placement-party policy.
  const recipients = [input.accountId]
  expect(
    before.state.deliveries.filter(row => row.startsWith('poster_restriction_notice:')),
  ).toEqual(
    recipients
      .flatMap(id => [
        `poster_restriction_notice:email:${id}`,
        `poster_restriction_notice:in_app:${id}`,
      ])
      .toSorted(),
  )
  const claimed = claimedDeliveryState(before, intentId)
  const prepared = {
    ...claimed,
    physical: { withheld: false, revision: before.physical.revision + 1 },
    state: {
      ...claimed.state,
      restrictions: claimed.state.restrictions.map(row =>
        row.id === input.restrictionId ? { ...row, lifted: now } : row,
      ),
      events: [...claimed.state.events, 'restoration_authorized_pending_delivery'].toSorted(),
      correspondence: [
        ...claimed.state.correspondence,
        ...recipients.map(() => 'restoration_notice' as const),
      ].toSorted(),
      deliveries: [
        ...claimed.state.deliveries,
        ...recipients.flatMap(id => [
          `poster_restoration_notice:email:${id}`,
          `poster_restoration_notice:in_app:${id}`,
        ]),
      ].toSorted(),
    },
    registry: [
      ...claimed.registry,
      { revision: before.physical.revision + 1, desired: 'withheld', state: 'completed' },
    ],
  }
  const published = {
    ...prepared,
    registry: prepared.registry.map(row =>
      row.revision === prepared.physical.revision
        ? { ...row, desired: 'allow', state: 'completed' }
        : row,
    ),
  }
  const terminal = terminalDeliveryState(published, intentId, 'completed')
  const completed = {
    ...terminal,
    state: {
      ...terminal.state,
      events: [...terminal.state.events, 'placement_restored'].toSorted(),
    },
  }
  const [result] = await Promise.allSettled([processCopyrightActionIntent(intentId, now)])
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before },
    { outcome: nativeCopyrightSerializationConflict, state: claimed },
    { outcome: nativeCopyrightSerializationConflict, state: prepared },
    { outcome: { status: 'fulfilled', value: 'applied' }, state: completed },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: await readDeliveryContractState(input),
  })
}

export async function assertCommittedStatementAppealRestoration(
  scene: Awaited<ReturnType<typeof createStatementAppealScene>>,
) {
  const restore = (await getCopyrightNoticePrivateAggregate(scene.noticeId))!.actionIntents.find(
    row => row.action === 'restore',
  )!
  await seedCompletedReversalStatement(restore.id)
  const restored = (await readTestCopyrightStatementIntents(scene.noticeId)).find(
    row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
  )!
  expect(restored.text).toContain('the appeal reversed the decision')
  expect((await getImagePlacementForCopyright(scene.target.placement_id))!.withheld).toBe(false)
  // Preserve the actual worker contract on a separate pending obligation, once.
  const worker = await createStatementAppealScene('reverse', true)
  await seedEffectiveAppealDecision(worker.decision, worker.noticeId)
  const intent = (await getCopyrightNoticePrivateAggregate(worker.noticeId))!.actionIntents.find(
    row => row.action === 'restore',
  )!
  await assertStatementAppealRestore(
    {
      noticeId: worker.noticeId,
      restrictionId: worker.restriction.id,
      placementId: worker.target.placement_id,
      accountId: worker.poster.id,
    },
    intent.id,
  )
}
