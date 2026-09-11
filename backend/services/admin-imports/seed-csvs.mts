import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsvRows } from '@modules/csv'
import { mintUUIDv7 } from '@modules/utils/ids'
import { upsertSystemAdministrator } from '@services/users/system-users'
import { getPrivateUserByAny } from '@services/users/get'
import { processTopicRow } from './process-topic-row.mts'
import type { ImportRow } from './types.mts'

const SEED_DIR = join(import.meta.dirname, '..', '..', '..', 'seed')

function makeSyntheticRow(inputData: Record<string, string>, rowIndex: number): ImportRow {
  return {
    id: mintUUIDv7(),
    batch_id: '',
    row_index: rowIndex,
    input_data: inputData as Record<string, unknown>,
    created_entity_id: null,
    completed_at: null,
    failed_at: null,
    error_message: null,
    created_at: new Date(),
    updated_at: new Date(),
  }
}

export type SeedCsvsResult = {
  processed: number
  errors: Array<{ slug: string; error: unknown }>
}

export function readSeedCsvRows(): Record<string, string>[] {
  const csvFiles = readdirSync(SEED_DIR)
    .filter(f => f.endsWith('-topics.csv'))
    .sort()

  const allRows: Record<string, string>[] = []
  for (const file of csvFiles) {
    const content = readFileSync(join(SEED_DIR, file), 'utf-8')
    allRows.push(...parseCsvRows(content))
  }
  return allRows
}

/**
 * Upserts a batch of topic rows into the database.
 *
 * Two passes are made so cross-batch parent relations are always established:
 * pass 1 creates/updates all topics; pass 2 re-processes to link any parents
 * that were not yet present during pass 1. Exported separately from
 * `seedTopicsFromCsvs` so tests can drive it with a small fixture batch
 * instead of the full shipped catalog.
 */
export async function seedTopicsFromRows(
  allRows: Record<string, string>[],
): Promise<SeedCsvsResult> {
  const systemUser = await upsertSystemAdministrator('system')
  const admin = await getPrivateUserByAny(systemUser.id)
  if (!admin) throw new Error('BUG: system admin user not found after upsert')

  const errors: SeedCsvsResult['errors'] = []

  // Pass 1: create / update every topic (establishes within-file parent relations)
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i]!
    try {
      // oxlint-disable-next-line no-await-in-loop -- each seed row records its own result before the next row can be classified for retry
      await processTopicRow(admin, makeSyntheticRow(row, i))
    } catch (error) {
      errors.push({ slug: row.slug?.trim() || `row-${i}`, error })
    }
  }

  // Pass 2: re-process rows that have parent_slugs or that failed in pass 1.
  // - parent_slugs: silently skipped when parent didn't exist yet (cross-file links)
  // - pass-1 errors: may have failed due to referral_company_slug pointing to a
  //   topic defined in a later file; retrying after all topics exist may succeed.
  const pass1ErrorSlugs = new Set(errors.map(e => e.slug))
  const rowsToRetry = allRows.flatMap((row, originalIndex) =>
    row.parent_slugs?.trim() || pass1ErrorSlugs.has(row.slug?.trim() || '')
      ? [{ row, originalIndex }]
      : [],
  )
  for (let i = 0; i < rowsToRetry.length; i++) {
    const { row, originalIndex } = rowsToRetry[i]!
    const slug = row.slug?.trim() || `row-${originalIndex}`
    try {
      // oxlint-disable-next-line no-await-in-loop -- retry rows remain serialized so a successful retry clears the matching first-pass error
      await processTopicRow(admin, makeSyntheticRow(row, originalIndex))
      // If pass 1 recorded an error for this row but pass 2 succeeded, clear it
      const errorIdx = errors.findIndex(e => e.slug === slug)
      if (errorIdx >= 0) errors.splice(errorIdx, 1)
    } catch (error) {
      // Record pass-2 failures only for rows that succeeded in pass 1
      // (rows that already failed in pass 1 are already recorded there)
      if (!pass1ErrorSlugs.has(slug)) {
        errors.push({ slug, error })
      }
    }
  }

  return { processed: allRows.length - errors.length, errors }
}

/**
 * Reads every seed/*-topics.csv file and upserts all of it via {@link seedTopicsFromRows}. Real
 * `backend/scripts/seed/index.mts` entrypoint — not exercised by an automated test. #8972 found
 * that running this full ~739-row import inside the ordinary sharded `backend-data-stores` project
 * causes `Connection terminated due to connection timeout` from PostgreSQL connection-pool
 * contention with the rest of that project's concurrent DB workload; the isolated project that
 * avoided it required `maxWorkers: 1`, which this repo no longer permits (see #9121). Its two
 * halves are independently covered: `readSeedCsvRows` by `seed-csvs-catalog.test.mts`,
 * `seedTopicsFromRows` by `seed-csvs.test.mts`'s fixture. This one-line composition is not.
 */
/* c8 ignore start -- see comment above; full-catalog DB import, exercised by the real seed script, not by tests (#8972) */
export async function seedTopicsFromCsvs(): Promise<SeedCsvsResult> {
  return seedTopicsFromRows(readSeedCsvRows())
}
/* c8 ignore stop */
