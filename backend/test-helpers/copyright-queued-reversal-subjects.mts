import { expect } from 'vitest'
import { processCopyrightActionIntent } from '../services/copyright-notices/action-delivery-process.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import {
  readDeliveryContractState,
  claimedDeliveryState,
  terminalDeliveryState,
} from './copyright-action-delivery-contract-state.mts'
import type { createQueuedReversalScene } from './copyright-queued-reversal-scenes.mts'

type Scene = Awaited<ReturnType<typeof createQueuedReversalScene>>

/** Restore on an already visible placement still commits its lift, statements and tuple authority together. */
export async function assertQueuedReversalRestore(scene: Scene) {
  const now = new Date()
  const before = await readDeliveryContractState(scene)
  expect(before.physical.withheld).toBe(false)
  expect(before.state.restrictions[0]!.lifted).toBeNull()
  const claimed = claimedDeliveryState(before, scene.restore.id)
  const revision = before.physical.revision
  const tuple = { revision, desired: 'withheld', state: 'completed' }
  const registry = before.registry.some(row => row.revision === revision)
    ? before.registry.map(row => (row.revision === revision ? tuple : row))
    : [...before.registry, tuple]
  const prepared = {
    ...claimed,
    state: {
      ...claimed.state,
      restrictions: claimed.state.restrictions.map(row =>
        row.id === scene.restrictionId ? { ...row, lifted: now } : row,
      ),
      events: [...claimed.state.events, 'restoration_authorized_pending_delivery'].toSorted(),
      correspondence: [...claimed.state.correspondence, 'restoration_notice' as const].toSorted(),
      deliveries: [
        ...claimed.state.deliveries,
        `poster_restoration_notice:email:${scene.accountId}`,
        `poster_restoration_notice:in_app:${scene.accountId}`,
      ].toSorted(),
    },
    registry,
  }
  const published = {
    ...prepared,
    registry: registry.map(row => (row.revision === revision ? { ...row, desired: 'allow' } : row)),
  }
  const terminal = terminalDeliveryState(published, scene.restore.id, 'completed')
  const completed = {
    ...terminal,
    state: {
      ...terminal.state,
      events: [...terminal.state.events, 'placement_restored'].toSorted(),
    },
  }
  const [result] = await Promise.allSettled([processCopyrightActionIntent(scene.restore.id, now)])
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before },
    { outcome: nativeCopyrightSerializationConflict, state: claimed },
    { outcome: nativeCopyrightSerializationConflict, state: prepared },
    { outcome: { status: 'fulfilled', value: 'applied' }, state: completed },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: await readDeliveryContractState(scene),
  })
}

/** The queued old withhold can abort or finish stale, but cannot hide the restored current tuple. */
export async function assertQueuedReversalWithhold(scene: Scene) {
  const before = await readDeliveryContractState(scene)
  const claimed = claimedDeliveryState(before, scene.withhold.id)
  const completed = terminalDeliveryState(
    claimed,
    scene.withhold.id,
    'stale',
    'The copyright restriction was lifted before its withhold delivery began.',
  )
  const [result] = await Promise.allSettled([
    processCopyrightActionIntent(scene.withhold.id, new Date()),
  ])
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before },
    { outcome: nativeCopyrightSerializationConflict, state: claimed },
    { outcome: { status: 'fulfilled', value: 'stale' }, state: completed },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: await readDeliveryContractState(scene),
  })
}
