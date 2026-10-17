import { useSyncExternalStore } from 'react'

// The page shows the same domain in more than one control; a mutation in one bumps this version so
// every control reloads the domain state instead of keeping its own stale copy.
let version = 0
const listeners = new Set<() => void>()

export function notifyDomainsChanged(): void {
  version += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Changes whenever any control mutated a queue domain; use it as an effect dependency to reload. */
export function useDomainsVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  )
}
