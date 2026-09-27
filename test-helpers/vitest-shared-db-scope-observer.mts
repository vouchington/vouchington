import type { SharedDbScopeObserver } from '../backend/data-stores/psql/shared-db-scope-observer.mts'

const observerKey = Symbol.for('voucha.shared-db-scope-observer')
type ObserverHost = Record<symbol, SharedDbScopeObserver | undefined>

/** Installs the test-only callback without adding a production registration API. */
export function installSharedDbScopeObserver(observer: SharedDbScopeObserver): () => void {
  const host = globalThis as unknown as ObserverHost
  const previous = host[observerKey]
  host[observerKey] = observer
  return () => {
    if (host[observerKey] === observer) host[observerKey] = previous
  }
}
