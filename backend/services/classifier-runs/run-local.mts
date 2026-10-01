import type { OwnedTransaction } from '@data-stores/psql'
import type { ClassifierRunAdapter, ClassifierRunLease } from './types.mts'

/**
 * Rejects a local outcome its configuration did not ask for or pin. An adapter without a local half
 * accepts none; an adapter with one decides through `validateLocal` (required iff configured).
 */
export function validateRunLocal<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  configuration: C,
  local: L | undefined,
): void {
  if (adapter.validateLocal) {
    adapter.validateLocal(configuration, local)
    return
  }
  if (local !== undefined) throw new Error('classifier run does not accept a local outcome')
}

/** Retains the local detector outcome in the caller's transaction; a no-op when there is none. */
export async function persistRunLocal<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  query: OwnedTransaction,
  lease: ClassifierRunLease<C>,
  local: L | undefined,
): Promise<void> {
  if (local === undefined) return
  if (!adapter.persistLocal) throw new Error('classifier run cannot persist a local outcome')
  await adapter.persistLocal(query, lease, local)
}
