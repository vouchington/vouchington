import {
  claimedDeliveryState,
  preparedDeliveryState,
  terminalDeliveryState,
  type DeliveryContractState,
} from './copyright-action-delivery-contract-state.mts'
import type { ActionDeliveryScene } from './copyright-action-delivery-contract-fixtures.mts'

export function ordinaryClaimed(
  before: DeliveryContractState,
  scene: ActionDeliveryScene,
): DeliveryContractState {
  return {
    ...claimedDeliveryState(before, scene.restore.id),
    failures: before.failures.map(row =>
      row.id === scene.restore.id ? { ...row, message: null } : row,
    ),
  }
}

export function ordinaryPrepared(
  before: DeliveryContractState,
  scene: ActionDeliveryScene,
  reentry: boolean,
  remainingStaydown: number,
  now: Date,
): DeliveryContractState {
  if (!reentry) {
    const prepared = preparedDeliveryState(before, {
      intentId: scene.restore.id,
      restrictionId: scene.restriction.id,
      now,
    })
    return { ...prepared, state: { ...prepared.state, staydown: remainingStaydown } }
  }
  return {
    ...before,
    registry: before.registry.map(row =>
      row.revision === before.physical.revision
        ? { ...row, desired: 'allow', state: 'pending' }
        : row,
    ),
    state: {
      ...before.state,
      events: [...before.state.events, 'restoration_authorized_pending_delivery'].toSorted(),
    },
  }
}

export function ordinaryDenied(prepared: DeliveryContractState): DeliveryContractState {
  return {
    ...prepared,
    registry: prepared.registry.map(row =>
      row.revision === prepared.physical.revision
        ? { ...row, desired: 'withheld', state: 'completed' }
        : row,
    ),
  }
}

export function ordinaryCompleted(
  prepared: DeliveryContractState,
  scene: ActionDeliveryScene,
): DeliveryContractState {
  const otherOperative = prepared.state.restrictions.some(
    row => row.id !== scene.restriction.id && row.lifted === null && row.review === 'confirm',
  )
  const terminal = terminalDeliveryState(prepared, scene.restore.id, 'completed')
  return {
    ...terminal,
    accounts: terminal.accounts.map(row => ({
      ...row,
      incidents: row.incidents.map(incident =>
        incident.notice === scene.notice.id ? { ...incident, operative: otherOperative } : incident,
      ),
    })),
    registry: terminal.registry.map(row =>
      row.revision === terminal.physical.revision
        ? { ...row, desired: 'allow', state: 'completed' }
        : row,
    ),
    state: {
      ...terminal.state,
      events: [...terminal.state.events, 'placement_restored'].toSorted(),
    },
  }
}
