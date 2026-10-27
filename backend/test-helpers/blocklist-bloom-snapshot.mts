import type { PoolClient } from '@data-stores/psql'
import { vi } from 'vitest'
import type * as UrlBlocklistBatches from '../services/urls-domains-blacklist/bloom-filter-batches.mts'

const pauseKey = 'vouchaBlocklistBloomSnapshotPause'

type PauseSlot = { action?: () => Promise<void> }

function pauseSlot(): PauseSlot {
  const globals = globalThis as typeof globalThis & { [pauseKey]?: PauseSlot }
  globals[pauseKey] ??= {}
  return globals[pauseKey]
}

/** Arms a one-shot pause that runs after the next wrapped blocklist snapshot is read. */
export function pauseAfterBlocklistBloomSnapshot(action: () => Promise<void>): void {
  pauseSlot().action = action
}

export function clearBlocklistBloomSnapshotPause(): void {
  pauseSlot().action = undefined
}

/** Wraps the loaded batch stream so an armed pause runs after that snapshot is read. */
export function installUrlBlocklistBloomSnapshotPause(
  batches: typeof UrlBlocklistBatches,
): () => void {
  const readBatches = batches.urlBlocklistBatchesFromDb
  const spy = vi
    .spyOn(batches, 'urlBlocklistBatchesFromDb')
    .mockImplementation(client => withBlocklistBloomSnapshotPause(readBatches(client)))
  return () => spy.mockRestore()
}

/** Yields the snapshot, then runs the armed pause before the rebuild can publish ready. */
async function* withBlocklistBloomSnapshotPause<T>(batches: AsyncIterable<T>): AsyncGenerator<T> {
  yield* batches
  const action = pauseSlot().action
  pauseSlot().action = undefined
  if (action) await action()
}

/** The membership read is inside the read-only transaction that checked replica visibility. */
export async function blocklistRebuildSnapshotIsStable(client: PoolClient): Promise<boolean> {
  const first = await readBlocklistRebuildSnapshot(client)
  const second = await readBlocklistRebuildSnapshot(client)
  return first.readOnly && first.snapshot === second.snapshot
}

async function readBlocklistRebuildSnapshot(
  client: PoolClient,
): Promise<{ readOnly: boolean; snapshot: string }> {
  const { rows } = await client.query<{ read_only: string; snapshot: string }>(
    `/* blocklistRebuildSnapshotIsStable */
      SELECT current_setting('transaction_read_only') AS read_only,
             pg_current_snapshot()::text AS snapshot`,
  )
  const row = rows[0]
  if (!row) throw new Error('blocklist rebuild snapshot was not readable')
  return { readOnly: row.read_only === 'on', snapshot: row.snapshot }
}
