import type { SharedDbScopeEvent as PlatformScopeEvent } from '@vouchington/postgres/query-telemetry'
import type { observeSharedDbScope } from '../backend/data-stores/psql/shared-db-scope-observer.mts'

const observerKey = Symbol.for('voucha.shared-db-scope-observer')
export type SharedDbScopeEvent = PlatformScopeEvent<
  Parameters<typeof observeSharedDbScope>[0],
  string
>
type SharedDbScopeObserver = (event: SharedDbScopeEvent) => void
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
