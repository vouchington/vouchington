import { write } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

export const INGESTION_ACCOUNT_ROW_COUNT = 1_200
export const INGESTION_UNQUALIFIED_ACCOUNT_COUNT = 1_000
export const INGESTION_BEDROCK_ROW_COUNT = 1_200

const PROVIDERS = [
  { name: 'facebook', idColumn: 'facebook_user_id', dataColumn: 'facebook_user_data' },
  { name: 'x', idColumn: 'x_user_id', dataColumn: 'x_user_data' },
  { name: 'github', idColumn: 'github_user_id', dataColumn: 'github_user_data' },
] as const

export function seedIngestionAccountId(index: number): string {
  return seedUuidAtTimestamp(postSeedTimestampMs(0) - 60_000, index)
}

/** Large, mostly ineligible keyset cohorts prove that source LIMIT precedes eligibility. */
export async function seedIngestionRawPages(): Promise<void> {
  await write(
    `/* seedIngestionRawPages */ UPDATE rss_feeds SET last_fetched_at = $1::timestamptz
     WHERE id IN (
       SELECT id FROM rss_feeds
       WHERE id >= $2::uuid AND id <= $3::uuid
       ORDER BY id LIMIT 2000
     )`,
    [new Date(postSeedTimestampMs(0)), seedUuid(0, '08'), seedUuid(1999, '08')],
  )
  for (const provider of PROVIDERS) {
    const rows = Array.from({ length: INGESTION_ACCOUNT_ROW_COUNT }, (_, offset) => {
      const index = offset + 1
      const eligible = offset >= INGESTION_UNQUALIFIED_ACCOUNT_COUNT
      return {
        id: seedIngestionAccountId(index),
        provider_id: `explain-ingestion-${provider.name}-${index}`,
        user_id: seedUuid(10_000 + offset, '01'),
        token: 'synthetic-explain-ciphertext',
        friends_synced_at: eligible ? null : new Date(postSeedTimestampMs(0)).toISOString(),
      }
    })
    // no-mistakes-disable-next-line query-reached-per-item: three fixed provider tables each receive one set-based JSON cohort insert.
    await write(
      `/* seedIngestionRawPages */ INSERT INTO ${provider.name}_accounts
        (id, ${provider.idColumn}, ${provider.dataColumn}, user_id, access_token_ciphertext, friends_synced_at)
       SELECT id, provider_id, '{}'::jsonb, user_id, token, friends_synced_at
       FROM jsonb_to_recordset($1::jsonb) AS source
         (id uuid, provider_id text, user_id uuid, token text, friends_synced_at timestamptz)
       ON CONFLICT (${provider.idColumn}) DO UPDATE SET
         id = EXCLUDED.id,
         user_id = EXCLUDED.user_id,
         access_token_ciphertext = EXCLUDED.access_token_ciphertext,
         friends_synced_at = EXCLUDED.friends_synced_at`,
      [JSON.stringify(rows)],
    )
  }

  const batches = Array.from({ length: INGESTION_BEDROCK_ROW_COUNT }, (_, offset) => ({
    id: seedUuid(offset + 1, 'b4'),
    position_index: offset,
  }))
  await write(
    `/* seedIngestionRawPages */ INSERT INTO bedrock_embedding_batches
      (id, job_arn, model_id, job_type, submitted_at, completed_at)
     SELECT id,
       'arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/' || id::text,
       'synthetic-explain-model', 'topics'::bedrock_embedding_batch_job_types,
       CASE WHEN position_index < 800 THEN CURRENT_TIMESTAMP
            ELSE CURRENT_TIMESTAMP - INTERVAL '48 hours' END,
       CASE WHEN position_index >= 1000 THEN CURRENT_TIMESTAMP ELSE NULL END
     FROM jsonb_to_recordset($1::jsonb) AS source (id uuid, position_index int)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(batches)],
  )
}
