import { vi } from 'vitest'
import { entitiesListeners } from '@queues/entity-listeners/queues'

type Add = typeof entitiesListeners.add

/**
 * Makes the next entity-listeners admission on the shared `background` queue run `onAdd`, which
 * resolves with the admission or throws. Admissions of other domains pass through untouched, so
 * the failure lands on the entity-listeners job and not on whichever job the producer enqueues
 * first.
 */
export function interceptNextEntityListenerAdd(onAdd: () => Promise<never>) {
  const original = entitiesListeners.add.bind(entitiesListeners) as Add
  let intercepted = false
  return vi.spyOn(entitiesListeners, 'add').mockImplementation(((
    ...args: Parameters<Add>
  ): ReturnType<Add> => {
    if (!intercepted && args[0].startsWith('entity-listeners.')) {
      intercepted = true
      return onAdd() as ReturnType<Add>
    }
    return original(...args)
  }) as Add)
}
