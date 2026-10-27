import { beginTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { runPersistedRetentionPages, type PersistedPage } from './run-persisted-pages.mts'

type Options = {
  retentionDays?: number
  batchSize?: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
}

export async function cleanupOldProviderResponseKeys(
  options: Options,
): Promise<PersistedPage<string>> {
  const cutoff = getRetentionCutoffDate(
    normalizeRetentionDays(options.retentionDays, 90),
    options.now,
  )
  if (options.lowerBoundDate && options.lowerBoundDate >= cutoff) {
    return { deleted: 0, hasMore: false, continuation: null }
  }
  return runPersistedRetentionPages(options, batchSize =>
    deleteProviderResponseKeyPage(getMinUUIDv7ForDate(cutoff), batchSize, options),
  )
}

async function deleteProviderResponseKeyPage(
  cutoffId: string,
  batchSize: number,
  options: Options,
): Promise<PersistedPage<string>> {
  await using query = await beginTransaction()
  const lower = options.lowerBoundDate ? 'AND id >= $3::uuid' : ''
  const { rows } = await query<{ id: string }>(
    `/* selectProviderResponseKeyRetentionPage */
    SELECT id FROM ai_usage_provider_response_keys WHERE id < $1::uuid
      ${lower}
    ORDER BY id LIMIT $2 FOR UPDATE`,
    [
      cutoffId,
      batchSize + 1,
      ...(options.lowerBoundDate ? [getMinUUIDv7ForDate(options.lowerBoundDate)] : []),
    ],
  )
  const page = rows.slice(0, batchSize)
  const { rowCount } = await query(
    `/* deleteProviderResponseKeyPage */
    DELETE FROM ai_usage_provider_response_keys WHERE id = ANY($1::uuid[])`,
    [page.map(row => row.id)],
  )
  await query.commit()
  return { deleted: rowCount ?? 0, hasMore: rows.length > batchSize, continuation: null }
}
