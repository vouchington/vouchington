import type { LifecycleScenarioObservation } from './lifecycle-scenarios.mts'

export function observeServerBoundary(
  visibleState: Record<string, unknown>,
  reconciliation: Record<string, unknown>,
): LifecycleScenarioObservation {
  return {
    visibleState,
    availableActions: [],
    reconciliation,
    cancellation: { behavior: 'not-applicable' },
  }
}
