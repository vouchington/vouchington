import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  TOP_URL_BATCH,
  TOP_URL_COUNT,
  TOP_URL_HOT,
  topUrlHostId,
} from '../seed-data/top-url-ranking.mts'

export async function captureTopUrlInsertBatch(): Promise<void> {
  const ids = Array.from({ length: TOP_URL_BATCH }, (_, index) =>
    seedUuid(TOP_URL_COUNT + index + 1, 'f3'),
  )
  registerScenarioContract('top-url-insert-batch', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: TOP_URL_BATCH * 2 },
      { kind: 'maxFunctionCalls', function: 'fn_update_url_latest_published_at', max: 1 },
    ],
  })
  await runAndCapture(
    'top-url-insert-batch',
    async () => {
      await using query = await beginTransaction()
      const before = await query<{ updates: number }>(
        `/* topUrlRanking.insertBatchBefore */ SELECT n_tup_upd::int AS updates
         FROM pg_stat_xact_user_tables WHERE relid = 'urls'::regclass`,
      )
      const { rows } = await query<{ id: string }>(
        `/* topUrlRanking.insertBatch */
         WITH inserted_guids AS (
           INSERT INTO rss_feed_item_guids (id, url_hostname_id, guid)
           SELECT id, $2::uuid, id::text FROM UNNEST($1::uuid[]) id RETURNING id
         )
         INSERT INTO rss_feed_items (id, url_id, data, bedrock_nova_multimodal_v1_content_sha256, gemini_embedding_2_content_sha256)
         SELECT id, $3::uuid, jsonb_build_object('title', 'Bulk top URL item',
           'isoDate', '2026-02-01T00:00:00Z'), sha256(id::text::bytea), sha256(id::text::bytea)
         FROM inserted_guids RETURNING id`,
        [ids, topUrlHostId(0), TOP_URL_HOT],
      )
      assert.equal(rows.length, TOP_URL_BATCH)
      const stats = await query<{ updates: number; latest_published_at: Date }>(
        `/* topUrlRanking.insertBatchResult */
         SELECT stats.n_tup_upd::int AS updates, urls.latest_published_at
         FROM pg_stat_xact_user_tables stats JOIN urls ON urls.id = $1
         WHERE stats.relid = 'urls'::regclass`,
        [TOP_URL_HOT],
      )
      assert.equal((stats.rows[0]?.updates ?? 0) - (before.rows[0]?.updates ?? 0), 1)
      assert.equal(stats.rows[0]?.latest_published_at.toISOString(), '2026-02-01T00:00:00.000Z')
    },
    undefined,
    'topUrlRanking.insertBatch',
  )
}
