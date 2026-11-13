import { expect } from 'vitest'
import { processCopyrightActionIntent } from '../services/copyright-notices/action-delivery-process.mts'
import {
  readDeliveryContractState,
  terminalDeliveryState,
} from './copyright-action-delivery-contract-state.mts'
import { actionDeliveryOwner } from './copyright-action-delivery-authority-subject.mts'
import { readCopyrightStaydownEntries } from './data-stores/psql/copyright-staydown.mts'
import {
  ordinaryClaimed,
  ordinaryPrepared,
  ordinaryDenied,
  ordinaryCompleted,
} from './copyright-ordinary-restoration-expected.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import type { ActionDeliveryScene } from './copyright-action-delivery-contract-fixtures.mts'

/** The one real worker invocation is tied to all legal, incident, physical and publication commits. */
export async function assertOrdinaryRestorationJob(
  scene: ActionDeliveryScene,
  mode: 'fresh' | 'reentry' | 'blockedPending' | 'notClaimed' = 'fresh',
  now = scene.restorationAt,
) {
  const owner = actionDeliveryOwner(scene)
  const [before, staydown] = await Promise.all([
    readDeliveryContractState(owner),
    readCopyrightStaydownEntries(scene.notice.id),
  ])
  const claimed = ordinaryClaimed(before, scene)
  const remaining = staydown.filter(
    row => row.copyright_restriction_id !== scene.restriction.id,
  ).length
  const prepared = ordinaryPrepared(claimed, scene, mode === 'reentry', remaining, now)
  const blocked = terminalDeliveryState(
    claimed,
    scene.restore.id,
    'blocked',
    'A current copyright restriction, review, deadline, or legal hold blocks this transition.',
  )
  const [result] = await Promise.allSettled([processCopyrightActionIntent(scene.restore.id, now)])
  const success =
    mode === 'notClaimed'
      ? { outcome: { status: 'fulfilled', value: 'not_claimed' }, state: before }
      : mode === 'blockedPending'
        ? { outcome: { status: 'fulfilled', value: 'blocked' }, state: ordinaryDenied(blocked) }
        : {
            outcome: { status: 'fulfilled', value: 'applied' },
            state: ordinaryCompleted(prepared, scene),
          }
  expect([
    success,
    { outcome: nativeCopyrightSerializationConflict, state: before },
    ...(mode === 'notClaimed'
      ? []
      : [{ outcome: nativeCopyrightSerializationConflict, state: claimed }]),
    ...(mode === 'fresh' || mode === 'reentry'
      ? [{ outcome: nativeCopyrightSerializationConflict, state: ordinaryDenied(prepared) }]
      : []),
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: await readDeliveryContractState(owner),
  })
}

/** A failed external allow leaves either a fully claimed preparation or a fully released denied obligation. */
export async function assertOrdinaryPublicationOutage(scene: ActionDeliveryScene, failure: Error) {
  const owner = actionDeliveryOwner(scene)
  const before = await readDeliveryContractState(owner)
  const claimed = ordinaryClaimed(before, scene)
  const prepared = ordinaryPrepared(claimed, scene, false, 0, scene.restorationAt)
  const denied = ordinaryDenied(prepared)
  const released = {
    ...denied,
    state: {
      ...denied.state,
      actions: denied.state.actions.map(row =>
        row.id === scene.restore.id ? { ...row, state: 'pending' } : row,
      ),
    },
    attempts: denied.attempts.map(row =>
      row.id === scene.restore.id ? { ...row, lease: false } : row,
    ),
    failures: denied.failures.map(row =>
      row.id === scene.restore.id ? { ...row, message: failure.message } : row,
    ),
  }
  const [result] = await Promise.allSettled([
    processCopyrightActionIntent(scene.restore.id, scene.restorationAt),
  ])
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before },
    { outcome: nativeCopyrightSerializationConflict, state: claimed },
    { outcome: nativeCopyrightSerializationConflict, state: prepared },
    { outcome: nativeCopyrightSerializationConflict, state: denied },
    { reason: failure, state: released },
  ]).toContainEqual({
    ...(result!.status === 'rejected' && result!.reason === failure
      ? { reason: failure }
      : { outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!) }),
    state: await readDeliveryContractState(owner),
  })
}
