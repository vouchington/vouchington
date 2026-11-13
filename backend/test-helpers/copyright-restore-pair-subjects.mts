import { expect } from 'vitest'
import { processCopyrightActionIntent } from '../services/copyright-notices/action-delivery-process.mts'
import { observeTestPostgresClientQueries } from './postgres-query-pool-observer.mts'
import {
  readDeliveryContractState,
  terminalDeliveryState,
  type DeliveryContractState,
} from './copyright-action-delivery-contract-state.mts'
import { actionDeliveryOwner } from './copyright-action-delivery-authority-subject.mts'
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

function owned(value: unknown, ids: string[]): boolean {
  return Array.isArray(value)
    ? value.some(item => owned(item, ids))
    : typeof value === 'string' && ids.includes(value)
}
function retainedState(
  before: DeliveryContractState,
  scene: ActionDeliveryScene,
  now: Date,
): DeliveryContractState {
  const claimed = ordinaryClaimed(before, scene)
  return terminalDeliveryState(
    {
      ...claimed,
      state: {
        ...claimed.state,
        restrictions: claimed.state.restrictions.map(row =>
          row.id === scene.restriction.id ? { ...row, lifted: now } : row,
        ),
        deadlines: claimed.state.deadlines.map(row =>
          row.id === scene.restore.copyright_notice_deadline_id
            ? { ...row, resolved_at: now, updated_at: expect.any(Date) }
            : row,
        ),
        events: [...claimed.state.events, 'restriction_lifted_placement_retained'].toSorted(),
        staydown: 0,
        correspondence: [...claimed.state.correspondence, 'restoration_notice' as const].toSorted(),
        deliveries: [
          ...claimed.state.deliveries,
          `poster_restoration_notice:email:${scene.claimant.id}`,
          `poster_restoration_notice:in_app:${scene.claimant.id}`,
        ].toSorted(),
      },
    },
    scene.restore.id,
    'completed',
  )
}

/** No DML/read-lock rendezvous: both real workers run once and may stop at every valid committed phase. */
export async function assertRestorePairOverlap(
  first: ActionDeliveryScene,
  second: ActionDeliveryScene,
  now: Date,
) {
  const scenes = [first, second] as const
  const read = () =>
    Promise.all(scenes.map(scene => readDeliveryContractState(actionDeliveryOwner(scene))))
  const before = await read()
  const observed = await observeTestPostgresClientQueries(
    () =>
      Promise.allSettled(scenes.map(scene => processCopyrightActionIntent(scene.restore.id, now))),
    undefined,
    () => {},
  )
  expect(observed.observerErrors).toEqual([])
  const queries = scenes.map(scene =>
    observed.queries.some(query =>
      query.values.some(value =>
        owned(value, [scene.notice.id, scene.restore.id, scene.restriction.id]),
      ),
    ),
  )
  expect(queries).toEqual([true, true])
  const writes = scenes.map(scene =>
    observed.queries.some(
      query =>
        query.text.includes('/* processCopyrightActionIntent:liftRestriction */') &&
        query.values.some(value => owned(value, [scene.restriction.id])),
    ),
  )
  const after = await read()
  const sharedState = (
    cases: DeliveryContractState[],
    completed: number[],
    physicalIndex?: number,
  ) => {
    const accounts = before[0]!.accounts.map(account => ({
      ...account,
      incidents: account.incidents.map(incident =>
        completed.some(index => scenes[index]!.notice.id === incident.notice)
          ? { ...incident, operative: false }
          : incident,
      ),
    }))
    const physical =
      physicalIndex === undefined ? before[0]!.physical : cases[physicalIndex]!.physical
    const registry =
      physicalIndex === undefined ? before[0]!.registry : cases[physicalIndex]!.registry
    return cases.map(state => ({ ...state, accounts, physical, registry }))
  }
  const native = { outcome: nativeCopyrightSerializationConflict, write: expect.any(Boolean) }
  const applied = { outcome: { status: 'fulfilled', value: 'applied' }, write: true }
  const aborted = scenes.map((scene, index) => [
    before[index]!,
    ordinaryClaimed(before[index]!, scene),
  ])
  const allowed: unknown[] = []
  for (const a of aborted[0]!)
    for (const b of aborted[1]!)
      allowed.push({ results: [native, native], state: sharedState([a, b], []) })
  for (const index of [0, 1]) {
    const sibling = index === 0 ? 1 : 0
    const retained = retainedState(before[index]!, scenes[index]!, now)
    for (const abort of aborted[sibling]!) {
      const cases = [...before]
      cases[index] = retained
      cases[sibling] = abort
      const results: unknown[] = [native, native]
      results[index] = applied
      allowed.push({ results, state: sharedState(cases, [index]) })
    }
    const claimed = ordinaryClaimed(before[sibling]!, scenes[sibling]!)
    const prepared = ordinaryPrepared(claimed, scenes[sibling]!, false, 0, now)
    const denied = ordinaryDenied(prepared)
    const completed = ordinaryCompleted(prepared, scenes[sibling]!)
    for (const option of [
      { state: denied, result: native, completed: [index] },
      { state: completed, result: applied, completed: [index, sibling] },
    ]) {
      const cases = [...before]
      cases[index] = retained
      cases[sibling] = option.state
      const results: unknown[] = [native, native]
      results[index] = applied
      results[sibling] = option.result
      allowed.push({ results, state: sharedState(cases, option.completed, sibling) })
    }
  }
  expect(allowed).toContainEqual({
    results: observed.result.map((result, index) => ({
      outcome: result.status === 'fulfilled' ? result : copyrightRaceResult(result),
      write: writes[index],
    })),
    state: after,
  })
}
