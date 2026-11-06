import { beginTransaction } from '@data-stores/psql'
import { FEED_URL_COUNT, ITEM_URL_POOL, seedUuid } from './common.mts'

const ORDINARY_URL_COUNT = FEED_URL_COUNT + ITEM_URL_POOL
const BENCHMARK_URL_COUNT = 10_000
const BENCHMARK_URL_INDEX_OFFSET = 1_700_000
const BENCHMARK_HOSTNAME_ID = seedUuid(900_000, '02')
const BENCHMARK_HOSTNAME = 'referral-link-measurement.example.test'
const BATCH_SIZE = 500

/** The 10k author's URL is distinct without adding rows to ordinary seed hostnames. */
export function referralBenchmarkUrlId(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= BENCHMARK_URL_COUNT)
    throw new Error('Invalid referral benchmark URL index')
  return seedUuid(index < ORDINARY_URL_COUNT ? index : BENCHMARK_URL_INDEX_OFFSET + index, '03')
}

/** Idempotent URL extension isolated to one synthetic hostname, in bounded inserts. */
export async function seedReferralBenchmarkUrls(): Promise<void> {
  console.log('Seeding referral benchmark URLs on their dedicated hostname...')
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedReferralBenchmarkHostname */ INSERT INTO url_hostnames
       (id, hostname, publicly_introduced_at) VALUES ($1::uuid, $2, CURRENT_TIMESTAMP)
     ON CONFLICT DO NOTHING`,
    [BENCHMARK_HOSTNAME_ID, BENCHMARK_HOSTNAME],
  )
  for (let low = ORDINARY_URL_COUNT; low < BENCHMARK_URL_COUNT; low += BATCH_SIZE) {
    const values: unknown[] = [BENCHMARK_HOSTNAME_ID]
    const rows: string[] = []
    for (let index = low; index < Math.min(low + BATCH_SIZE, BENCHMARK_URL_COUNT); index++) {
      values.push(referralBenchmarkUrlId(index), `https://${BENCHMARK_HOSTNAME}/link/${index}`)
      const urlParam = values.length
      rows.push(`($${urlParam - 1}::uuid, $${urlParam})`)
    }
    // no-mistakes-disable-next-line query-reached-per-item: a fixed 6,900-row benchmark fixture is inserted in bounded 500-row statements.
    await transaction(
      `/* seedReferralBenchmarkUrls */ INSERT INTO urls (id, url, hostname_id, search_params)
       SELECT input.id, input.url, $1::uuid, '{}'::jsonb
       FROM (VALUES ${rows.join(', ')}) AS input(id, url)
       ON CONFLICT DO NOTHING`,
      values,
    )
  }
  await transaction.commit()
}
