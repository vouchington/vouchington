import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'
import { insertTestStagedImage } from './entities/images-insert.mts'

import type { AbandonedUploadSweep, UploadCleanupWindow } from '@queues/content-analysis/types'

type Counts = { cleaned: number; recovered: number; stagedSourcesDeleted: number }
type RunCleanup = (
  sweep: AbandonedUploadSweep,
  save: (sweep: AbandonedUploadSweep) => Promise<void>,
) => Promise<Counts & { hasMore: boolean }>

/** Group only adjacent owned UUIDs at the identical native staged timestamp. */
export async function makeOwnedUploadCleanupSweep(
  imageIds: readonly string[],
  now: Date,
): Promise<AbandonedUploadSweep> {
  if (!imageIds.length || imageIds.length > 1000) throw new Error('Invalid owned image window size')
  const { rows } = await read<{
    id: string
    staged_at: string
  }>(sql`/* makeOwnedUploadCleanupSweep */
    SELECT id, to_char(upload_staged_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS staged_at
    FROM images WHERE id = ANY(${imageIds}::uuid[]) ORDER BY id LIMIT ${imageIds.length}`)
  if (rows.length !== imageIds.length) throw new Error('Owned staged image fixture missing')
  const first = rows[0]
  const last = rows.at(-1)
  if (!first || !last) throw new Error('Empty owned image window')
  for (const [index, row] of rows.entries()) {
    if (
      row.staged_at !== first.staged_at ||
      uuidInteger(row.id) !== uuidInteger(first.id) + BigInt(index)
    )
      throw new Error('Refusing a noncontiguous upload cleanup fixture window')
  }
  const window: UploadCleanupWindow = {
    upper: { id: last.id, stagedAt: last.staged_at },
    after: { id: formatUuid(uuidInteger(first.id) - 1n), stagedAt: first.staged_at },
    done: false,
  }
  return {
    recoveryCutoff: timestamp(new Date(now.getTime() - 60 * 60 * 1000)),
    abandonmentCutoff: timestamp(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
    windows: { staged: { ...window }, recovery: { ...window }, abandonment: { ...window } },
  }
}

/** Boundary rows remain in the input: real service predicates, never this driver, decide eligibility. */
export async function cleanupOwnedTestUploads(
  run: RunCleanup,
  imageIds: readonly string[],
  now: Date,
): Promise<Counts> {
  const total: Counts = { cleaned: 0, recovered: 0, stagedSourcesDeleted: 0 }
  for (const id of imageIds) {
    const sweep = await makeOwnedUploadCleanupSweep([id], now)
    const result = await run(sweep, async () => {})
    if (result.hasMore) throw new Error('Singleton cleanup unexpectedly requires continuation')
    total.cleaned += result.cleaned
    total.recovered += result.recovered
    total.stagedSourcesDeleted += result.stagedSourcesDeleted
  }
  return total
}

export async function insertOwnedUploadCleanupCluster(
  userId: string,
  count: number,
  stagedAt: Date,
) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000)
    throw new Error('Invalid fixture count')
  const base = uuidInteger(v7()) & ~0xffffn
  const ids: string[] = []
  for (let index = 1; index <= count; index += 1) {
    const id = formatUuid(base + BigInt(index))
    ids.push(await insertTestStagedImage(userId, { id, stagedAt }))
  }
  return ids
}

function uuidInteger(id: string) {
  return BigInt(`0x${id.replaceAll('-', '')}`)
}

function formatUuid(value: bigint) {
  const hex = value.toString(16).padStart(32, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function timestamp(value: Date) {
  return value.toISOString().replace('Z', '000Z')
}
