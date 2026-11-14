import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsvRows } from '@modules/csv'
import { mintUUIDv7 } from '@modules/utils/ids'
import { upsertSystemUser } from '@services/users/system-users'
import { getPrivateUserByAny } from '@services/users/get'
import { processTopicRow } from './process-topic-row.mts'
import { validateTopicRows } from './validate-topics.mts'
import { runSystemTopicSeedImport } from '@services/topics/seed-import-authority'
import type { PrivateUser } from '@services/users/types'
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

export function readSeedCsvRows(directory = SEED_DIR): Record<string, string>[] {
  const csvFiles = readdirSync(directory)
    .filter(f => f.endsWith('-topics.csv'))
    .toSorted()

  const allRows: Record<string, string>[] = []
  for (const file of csvFiles) {
    const content = readFileSync(join(directory, file), 'utf8')
    allRows.push(...parseCsvRows(content))
  }
  return allRows
}

/**
 * Upserts a batch of topic rows into the database.
 *
 * Two passes are made so cross-batch parent relations are always established:
 * pass 1 creates/updates all topics; pass 2 re-processes to link any parents
 * that were not yet present during pass 1.
 */
async function seedTopicsFromRows(
  actor: PrivateUser,
  allRows: Record<string, string>[],
): Promise<SeedCsvsResult> {
  return runSystemTopicSeedImport(actor, () => importSeedRows(actor, allRows))
}

async function importSeedRows(
  actor: PrivateUser,
  rawRows: Record<string, string>[],
): Promise<SeedCsvsResult> {
  const errors: SeedCsvsResult['errors'] = []
  // Seeds use the same row rules as admin imports (including the parent_slugs cap).
  const validation = validateTopicRows(rawRows)
  const allRows = rawRows.filter((_, index) => validation.rows[index]?.valid)
  for (const result of validation.rows) {
    if (result.valid) continue
    errors.push({
      slug: rawRows[result.row_index]?.slug?.trim() || `row-${result.row_index}`,
      error: new Error(result.errors.join('; ')),
    })
  }

  const validationErrorCount = errors.length

  // Pass 1: create / update every topic (establishes within-file parent relations)
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i]!
    try {
      // oxlint-disable-next-line no-await-in-loop -- each seed row records its own result before the next row can be classified for retry
      await processTopicRow(actor, makeSyntheticRow(row, i))
    } catch (err) {
      errors.push({ slug: row.slug?.trim() || `row-${i}`, error: err })
    }
  }

  // Pass 2: re-process rows that have parent_slugs or that failed in pass 1.
  // - parent_slugs: silently skipped when parent didn't exist yet (cross-file links)
  // - pass-1 errors: may have failed due to referral_company_slug pointing to a
  //   topic defined in a later file; retrying after all topics exist may succeed.
  const pass1ErrorSlugs = new Set(errors.slice(validationErrorCount).map(e => e.slug))
  const rowsToRetry = allRows.flatMap((row, originalIndex) =>
    row.parent_slugs?.trim() || pass1ErrorSlugs.has(row.slug?.trim() || '')
      ? [{ row, originalIndex }]
      : [],
  )
  for (const { row, originalIndex } of rowsToRetry) {
    const slug = row.slug?.trim() || `row-${originalIndex}`
    try {
      // oxlint-disable-next-line no-await-in-loop -- retry rows remain serialized so a successful retry clears the matching first-pass error
      await processTopicRow(actor, makeSyntheticRow(row, originalIndex))
      // If pass 1 recorded an error for this row but pass 2 succeeded, clear it
      const errorIdx = errors.findIndex(
        (e, index) => index >= validationErrorCount && e.slug === slug,
      )
      if (errorIdx >= 0) errors.splice(errorIdx, 1)
    } catch (err) {
      // Record pass-2 failures only for rows that succeeded in pass 1
      // (rows that already failed in pass 1 are already recorded there)
      if (!pass1ErrorSlugs.has(slug)) {
        errors.push({ slug, error: err })
      }
    }
  }

  return { processed: rawRows.length - errors.length, errors }
}

/** The seed script imports the shipped catalog; callers may supply an actor and a bounded batch. */
export async function seedTopicsFromCsvs(options: {
  actor?: PrivateUser
  rows: Record<string, string>[]
}): Promise<SeedCsvsResult> {
  let actor: PrivateUser | null | undefined = options.actor
  if (!actor) {
    const systemUser = await upsertSystemUser('system')
    actor = await getPrivateUserByAny(systemUser.id, { readOnly: false })
    if (!actor) throw new Error('BUG: system seed actor not found after upsert')
  }
  return seedTopicsFromRows(actor, options.rows)
}
