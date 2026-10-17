import { vi } from 'vitest'
import { entitiesListeners } from '@queues/entity-listeners/queues'

type Add = typeof entitiesListeners.add

/**
 * Makes the next entity-listeners admission on the shared `background` queue run `onAdd`, which
 * resolves with the admission or throws. Admissions of other domains pass through untouched, so
 * the failure lands on the entity-listeners job and not on whichever job the producer enqueues
 * first.
 */
export function interceptNextEntityListenerAdd(onAdd: () => ReturnType<Add>) {
  const original = entitiesListeners.add as Add
  let intercepted = false
  return vi.spyOn(entitiesListeners, 'add').mockImplementation(((
    ...args: Parameters<Add>
  ): ReturnType<Add> => {
    if (!intercepted && args[0].startsWith('entity-listeners.')) {
      intercepted = true
      return onAdd()
    }
    return Reflect.apply(original, entitiesListeners, args) as ReturnType<Add>
  }) as Add)
}

type AddBulk = typeof entitiesListeners.addBulk

/** Like `interceptNextEntityListenerAdd`, for the next bulk admission that carries an entity-listeners job. */
export function interceptNextEntityListenerAddBulk(onAddBulk: () => ReturnType<AddBulk>) {
  const original = entitiesListeners.addBulk as AddBulk
  let intercepted = false
  return vi.spyOn(entitiesListeners, 'addBulk').mockImplementation(((
    ...args: Parameters<AddBulk>
  ): ReturnType<AddBulk> => {
    if (!intercepted && args[0].some(job => job.name.startsWith('entity-listeners.'))) {
      intercepted = true
      return onAddBulk()
    }
    return Reflect.apply(original, entitiesListeners, args) as ReturnType<AddBulk>
  }) as AddBulk)
}
