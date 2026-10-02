import {
  readOldestIncompleteClassifierRun,
  readOldestPendingClassifierRequest,
  type OldestOpenClassifierItem,
} from './health-ages.mts'
import { readClassifierTerminalCounts, type ClassifierTerminalCounts } from './health-terminal.mts'
import {
  readUnrequestedClassifierFeedItems,
  type ClassifierRunHealthScope,
  type UnrequestedClassifierSubjects,
} from './health-unrequested.mts'
import type { ClassifierRunAdapter } from './types.mts'

export type ClassifierRunHealth = {
  classifier: string
  oldestIncompleteRun: OldestOpenClassifierItem | null
  oldestPendingRequest: OldestOpenClassifierItem | null
  terminal: ClassifierTerminalCounts
  /** Null when the classifier's producers do not cover every eligible feed item. */
  unrequestedFeedItems: UnrequestedClassifierSubjects | null
}

/**
 * One classifier's receipt health, from durable state alone and written once against the shared
 * lifecycle, so every classifier that runs on a receipt is covered by the same four questions:
 * how old is the oldest unfinished run, how old is the oldest request that never became a run, how
 * did recent runs end, and which eligible subjects were never requested. `now` is injected so a
 * test proves a stuck item by moving the clock, not by fabricating old ids.
 */
export async function readClassifierRunHealth<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  now: Date,
  scope?: ClassifierRunHealthScope,
): Promise<ClassifierRunHealth> {
  const [oldestIncompleteRun, oldestPendingRequest, terminal, unrequestedFeedItems] =
    await Promise.all([
      readOldestIncompleteClassifierRun(adapter.slug, now),
      readOldestPendingClassifierRequest(adapter.slug, now),
      readClassifierTerminalCounts(adapter.slug, now),
      readUnrequestedClassifierFeedItems(adapter, now, scope),
    ])
  return {
    classifier: adapter.slug,
    oldestIncompleteRun,
    oldestPendingRequest,
    terminal,
    unrequestedFeedItems,
  }
}
