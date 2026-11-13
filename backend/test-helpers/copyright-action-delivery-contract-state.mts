import { getImagePlacementForCopyright } from '../services/images/placements.mts'
import { expect } from 'vitest'
import { readCommittedReversalState } from './copyright-reversal-state.mts'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

export type DeliveryContractOwner = {
  noticeId: string
  restrictionId: string
  placementId: string
  accountId: string
}

export async function readDeliveryContractState(input: DeliveryContractOwner) {
  const [state, effective, aggregate, placement] = await Promise.all([
    readCommittedReversalState(input.noticeId, input.restrictionId, input.placementId),
    readEffectiveReviewState(input.noticeId, [input.accountId]),
    getCopyrightNoticePrivateAggregate(input.noticeId),
    getImagePlacementForCopyright(input.placementId),
  ])
  return {
    ...state,
    placementDeleted: placement!.deleted,
    accounts: effective.accounts,
    provenance: effective.provenance,
    dispositions: effective.dispositions,
    misuse: effective.misuse,
    failures: aggregate!.actionIntents.map(row => ({ id: row.id, message: row.failure_message })),
  }
}
export type DeliveryContractState = Awaited<ReturnType<typeof readDeliveryContractState>>

export function claimedDeliveryState(
  before: DeliveryContractState,
  intentId: string,
): DeliveryContractState {
  return {
    ...before,
    state: {
      ...before.state,
      actions: before.state.actions.map(row =>
        row.id === intentId ? { ...row, state: 'claimed' } : row,
      ),
    },
    attempts: before.attempts.map(row =>
      row.id === intentId ? { ...row, count: row.count + 1, lease: true } : row,
    ),
  }
}

export function terminalDeliveryState(
  before: DeliveryContractState,
  intentId: string,
  outcome: 'stale' | 'blocked' | 'completed',
  message: string | null = null,
): DeliveryContractState {
  return {
    ...before,
    state: {
      ...before.state,
      actions: before.state.actions.map(row =>
        row.id === intentId ? { ...row, state: outcome } : row,
      ),
    },
    attempts: before.attempts.map(row =>
      row.id === intentId ? { ...row, lease: false, reason: outcome } : row,
    ),
    failures: before.failures.map(row => (row.id === intentId ? { ...row, message } : row)),
  }
}

/** All committed restoration preparation effects, while its incident stays operative until completion. */
export function preparedDeliveryState(
  before: DeliveryContractState,
  input: {
    intentId: string
    restrictionId: string
    now: Date
    unavailable?: boolean
  },
): DeliveryContractState {
  const restriction = before.state.restrictions.find(row => row.id === input.restrictionId)!
  const action = before.state.actions.find(row => row.id === input.intentId)!
  const target = before.state.targets.find(row => row.id === restriction.target)!
  const recipient = before.provenance.find(row => row.target === target.id)!.account
  const event = input.unavailable
    ? 'restoration_unavailable'
    : 'restoration_authorized_pending_delivery'
  return {
    ...before,
    physical: {
      withheld: false,
      revision: before.physical.revision + (before.physical.withheld ? 1 : 0),
    },
    registry: input.unavailable
      ? before.registry
      : [
          ...before.registry,
          { revision: before.physical.revision + 1, desired: 'allow', state: 'pending' },
        ],
    state: {
      ...before.state,
      restrictions: before.state.restrictions.map(row =>
        row.id === input.restrictionId ? { ...row, lifted: input.now } : row,
      ),
      deadlines: before.state.deadlines.map(row =>
        row.id === action.deadline
          ? { ...row, resolved_at: input.now, updated_at: expect.any(Date) }
          : row,
      ),
      staydown: 0,
      events: [...before.state.events, event].toSorted(),
      correspondence: [...before.state.correspondence, 'restoration_notice' as const].toSorted(),
      deliveries: [
        ...before.state.deliveries,
        `poster_restoration_notice:email:${recipient}`,
        `poster_restoration_notice:in_app:${recipient}`,
      ].toSorted(),
    },
  }
}

export function statutoryDeliveryCompleted(
  before: DeliveryContractState,
  noticeId: string,
): DeliveryContractState {
  return {
    ...before,
    accounts: before.accounts.map(row => ({
      ...row,
      incidents: row.incidents.map(incident =>
        incident.notice === noticeId ? { ...incident, operative: false } : incident,
      ),
    })),
  }
}
