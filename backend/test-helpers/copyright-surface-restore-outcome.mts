import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import { expect } from 'vitest'
import { processCopyrightActionIntent } from '../services/copyright-notices/action-delivery-process.mts'
import { readCommittedReversalState } from './copyright-reversal-state.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'

/** No retry: a job may stop before claiming, after claiming, or after a complete preparation. */
export async function assertSurfaceRestoreOutcome(input: {
  noticeId: string
  restrictionId: string
  placementId: string
  restoreId: string
  deliveries: string[]
  outcome: 'visible' | 'still_hidden' | 'blocked'
  now?: Date
  deadlineId?: string
  incidentAccountIds?: string[]
}) {
  const read = async () => {
    const [state, incidents] = await Promise.all([
      readCommittedReversalState(input.noticeId, input.restrictionId, input.placementId),
      readEffectiveReviewState(input.noticeId, input.incidentAccountIds ?? []),
    ])
    return {
      ...state,
      accounts: incidents.accounts,
      provenance: incidents.provenance,
      dispositions: incidents.dispositions,
      misuse: incidents.misuse,
    }
  }
  const before = await read()
  if (input.deadlineId) {
    // This owned statutory scene starts with one confirmed operative incident and retained target.
    expect(input.incidentAccountIds).toEqual([expect.any(String)])
    expect(before.accounts).toEqual(
      input.incidentAccountIds!.map(id => ({
        id,
        live: true,
        incidents: [{ notice: input.noticeId, operative: true, disposition: null }],
        open: [],
        reviews: [],
      })),
    )
    expect(before.provenance).toEqual(
      input.incidentAccountIds!.map(account => ({
        account,
        target: before.state.restrictions.find(row => row.id === input.restrictionId)!.target,
      })),
    )
  }
  const [result] = await Promise.allSettled([
    processCopyrightActionIntent(input.restoreId, input.now),
  ])
  const after = await read()
  const claimed = {
    ...before,
    state: {
      ...before.state,
      actions: before.state.actions.map(row =>
        row.id === input.restoreId ? { ...row, state: 'claimed' } : row,
      ),
    },
    attempts: before.attempts.map(row =>
      row.id === input.restoreId ? { ...row, count: 1, lease: true } : row,
    ),
  }
  const blocked = {
    ...claimed,
    state: {
      ...claimed.state,
      actions: claimed.state.actions.map(row =>
        row.id === input.restoreId ? { ...row, state: 'blocked' } : row,
      ),
    },
    attempts: claimed.attempts.map(row =>
      row.id === input.restoreId ? { ...row, lease: false, reason: 'blocked' } : row,
    ),
  }
  const prepared = {
    ...claimed,
    state: {
      ...claimed.state,
      deadlines: claimed.state.deadlines.map(row =>
        row.id === input.deadlineId
          ? { ...row, resolved_at: input.now, updated_at: expect.any(Date) }
          : row,
      ),
      restrictions: claimed.state.restrictions.map(row =>
        row.id === input.restrictionId ? { ...row, lifted: expect.any(Date) } : row,
      ),
      events: [
        ...claimed.state.events,
        input.outcome === 'still_hidden'
          ? 'restriction_lifted_placement_retained'
          : 'restoration_authorized_pending_delivery',
      ].toSorted(),
      deliveries: [...claimed.state.deliveries, ...input.deliveries].toSorted(),
      correspondence: [
        ...claimed.state.correspondence,
        ...Array.from(new Set(input.deliveries.map(row => row.split(':')[2]))).map(
          () => 'restoration_notice',
        ),
      ].toSorted(),
    },
    physical:
      input.outcome === 'still_hidden'
        ? before.physical
        : { withheld: false, revision: before.physical.revision + 1 },
    registry:
      input.outcome === 'still_hidden'
        ? before.registry
        : [
            ...before.registry,
            { revision: before.physical.revision + 1, desired: 'withheld', state: 'completed' },
          ],
  }
  const completed = {
    ...prepared,
    accounts: prepared.accounts.map(account => ({
      ...account,
      incidents: account.incidents.map(incident =>
        input.deadlineId && incident.notice === input.noticeId
          ? { ...incident, operative: false }
          : incident,
      ),
    })),
    state: {
      ...prepared.state,
      actions: prepared.state.actions.map(row =>
        row.id === input.restoreId ? { ...row, state: 'completed' } : row,
      ),
      events: [
        ...prepared.state.events,
        ...(input.outcome === 'visible' ? ['placement_restored'] : []),
      ].toSorted(),
    },
    attempts: prepared.attempts.map(row =>
      row.id === input.restoreId ? { ...row, lease: false, reason: 'completed' } : row,
    ),
    registry:
      input.outcome === 'still_hidden'
        ? before.registry
        : [
            ...before.registry,
            { revision: before.physical.revision + 1, desired: 'allow', state: 'completed' },
          ],
  }
  const aborted = [before, claimed].map(state => ({
    outcome: nativeCopyrightSerializationConflict,
    state,
  }))
  const allowed =
    input.outcome === 'blocked'
      ? [...aborted, { outcome: { status: 'fulfilled', value: 'blocked' }, state: blocked }]
      : [
          ...aborted,
          ...(input.outcome === 'visible'
            ? [{ outcome: nativeCopyrightSerializationConflict, state: prepared }]
            : []),
          { outcome: { status: 'fulfilled', value: 'applied' }, state: completed },
        ]
  expect(allowed).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after,
  })
}

/** A completed job replay is nonwriting, including an SSI abort in its claim guard. */
export async function assertSurfaceRestoreReplay(input: {
  noticeId: string
  restrictionId: string
  placementId: string
  restoreId: string
}) {
  const before = await readCommittedReversalState(
    input.noticeId,
    input.restrictionId,
    input.placementId,
  )
  const [result] = await Promise.allSettled([processCopyrightActionIntent(input.restoreId)])
  expect([
    { outcome: { status: 'fulfilled', value: 'not_claimed' }, state: before },
    { outcome: nativeCopyrightSerializationConflict, state: before },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: await readCommittedReversalState(input.noticeId, input.restrictionId, input.placementId),
  })
}
