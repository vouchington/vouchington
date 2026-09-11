import {
  lifecycleNotApplicable,
  stringArrayValue,
  stringValue,
  type LifecycleAdapter,
} from './adapters'

export const webPrivatePostCollection: LifecycleAdapter = input => {
  const action = input.action.type
  if (action === 'remove') {
    const loaded = stringArrayValue(input.preconditions, 'loadedItemIds')
    const removed = stringValue(input.action, 'itemId')
    return {
      visibleState: {
        presentItemIds: loaded.filter(id => id !== removed),
        absentItemIds: removed ? [removed] : [],
      },
      availableActions: [],
      reconciliation: { strategy: 'remove-one-by-id' },
      cancellation: lifecycleNotApplicable,
    }
  }
  if (action !== 'load-more') {
    throw new Error(`Unknown web private-post lifecycle action: ${action}`)
  }
  return {
    visibleState: {
      loadedVisibleCount: Number(input.serverOutcome.loadedVisibleCount ?? 0),
      duplicates: 0,
    },
    availableActions: [],
    reconciliation: { strategy: 'browser-continuation' },
    cancellation: lifecycleNotApplicable,
  }
}
