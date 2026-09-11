import type { TransactionQuery } from '@data-stores/psql/types'
import { retainPostPublicationKeys, type PostPublicationRetainedKey } from './capture-keys.mts'

export type PostPublicationImpactsByScope = {
  scopeId: string
  impacts: { postIds: Set<string>; topicIds: Set<string> }
}

export async function retainPostPublicationImpacts(
  query: TransactionQuery,
  workByScopeId: ReadonlyMap<string, string>,
  changes: readonly PostPublicationImpactsByScope[],
): Promise<void> {
  const keys: Array<{ dirtyWorkId: string } & PostPublicationRetainedKey> = changes.flatMap(
    ({ scopeId, impacts }) => {
      const dirtyWorkId = workByScopeId.get(scopeId)
      if (!dirtyWorkId) throw new Error(`Missing dirty work for publication scope ${scopeId}`)
      return [
        ...[...impacts.postIds].map(uuidValue => ({
          dirtyWorkId,
          kind: 'impact_post' as const,
          uuidValue,
        })),
        ...[...impacts.topicIds].map(uuidValue => ({
          dirtyWorkId,
          kind: 'impact_topic' as const,
          uuidValue,
        })),
      ]
    },
  )
  const byDirtyWorkId = Map.groupBy(keys, key => key.dirtyWorkId)
  for (const [dirtyWorkId, retainedKeys] of [...byDirtyWorkId].toSorted(([a], [b]) =>
    a.localeCompare(b),
  )) {
    // oxlint-disable-next-line no-await-in-loop -- each retained-key statement is bounded.
    await retainPostPublicationKeys(query, dirtyWorkId, retainedKeys)
  }
}
