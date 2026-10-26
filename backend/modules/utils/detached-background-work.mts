import { AsyncLocalStorage } from 'node:async_hooks'

// The cache and the test profiler can be loaded through separate module graphs.
const DETACHED_BACKGROUND_WORK_KEY = Symbol.for('voucha.detachedBackgroundWork')
const storageGlobal = globalThis as typeof globalThis & {
  [DETACHED_BACKGROUND_WORK_KEY]?: AsyncLocalStorage<true>
}
storageGlobal[DETACHED_BACKGROUND_WORK_KEY] ??= new AsyncLocalStorage<true>()
const detachedBackgroundWorkStorage = storageGlobal[DETACHED_BACKGROUND_WORK_KEY]

/** Mark cache refresh work without replacing any request, trace, or error-reporting context. */
function runDetachedBackgroundWork(refresh: () => Promise<void>): Promise<void> {
  return detachedBackgroundWorkStorage.run(true, refresh)
}

function isDetachedBackgroundWork(): boolean {
  return detachedBackgroundWorkStorage.getStore() === true
}

export const detachedBackgroundWork = {
  run: runDetachedBackgroundWork,
  isDetached: isDetachedBackgroundWork,
}
