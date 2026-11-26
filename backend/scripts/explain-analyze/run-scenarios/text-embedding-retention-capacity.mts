import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { cleanupTextEmbeddingCache } from '@services/data-retention/cleanup-text-embeddings'
import { DATA_RETENTION_MAX_VALUES } from '@services/data-retention/config'
import { seedTextEmbeddingRetentionCapacityForTest } from '@voucha/test-helpers/entities/ai-retention'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

const pageSize = DATA_RETENTION_MAX_VALUES.ai_retention_page_size
const excludedRows = 9_000
const totalRows = excludedRows * 2 + pageSize + 1
const lowerBoundDate = new Date('2075-02-01T00:00:00Z')
const now = new Date('2075-06-01T00:00:00Z')

export async function runTextEmbeddingRetentionCapacityScenario(): Promise<void> {
  const scenario = 'text-embedding-retention-at-cap'
  const queryName = 'deleteTextEmbeddingRetentionPage'
  const prefix = randomUUID()
  const seedRows = () =>
    seedTextEmbeddingRetentionCapacityForTest({
      prefix,
      olderCount: excludedRows,
      eligibleCount: pageSize + 1,
      freshCount: excludedRows,
      lowerBoundDate,
      now,
    })

  async function survivingOrdinals() {
    const { rows } = await write<{ n: number }>(sql`
      /* inspectTextEmbeddingRetentionCapacity */
      SELECT input.n FROM generate_series(1, ${totalRows}::int) AS input(n)
      JOIN bedrock_nova_multimodal_v1_embeddings embedding
        ON embedding.content_sha256 = digest(${prefix}::text || ':' || input.n, 'sha256')
      ORDER BY input.n
    `)
    return rows.map(row => row.n)
  }

  await seedRows()
  try {
    await write(
      '/* analyzeTextEmbeddingRetentionCapacity */ ANALYZE bedrock_nova_multimodal_v1_embeddings',
    )
    registerScenarioContract(scenario, {
      expectations: [],
      seededRows: { bedrock_nova_multimodal_v1_embeddings: totalRows },
    })
    const expectedSurvivors = [
      ...Array.from({ length: excludedRows }, (_, i) => i + 1),
      ...Array.from({ length: excludedRows + 1 }, (_, i) => i + excludedRows + pageSize + 1),
    ]
    const options = { lowerBoundDate, now, batchSize: pageSize, maxBatches: 1 }
    await runAndCapture(
      scenario,
      async () => {
        const first = await cleanupTextEmbeddingCache(options)
        assert.deepEqual(first, { deleted: pageSize, hasMore: true, continuation: null })
        assert.deepEqual(await survivingOrdinals(), expectedSurvivors)
      },
      undefined,
      queryName,
      { afterCapture: seedRows },
    )
    const next = await cleanupTextEmbeddingCache({ ...options, maxBatches: 2 })
    assert.deepEqual(next, { deleted: pageSize + 1, hasMore: false, continuation: null })
    assert.deepEqual(
      await survivingOrdinals(),
      expectedSurvivors.filter(n => n !== excludedRows + pageSize + 1),
    )
  } finally {
    await write(sql`
      /* cleanupTextEmbeddingRetentionCapacity */
      DELETE FROM bedrock_nova_multimodal_v1_embeddings
      WHERE content_sha256 IN (
        SELECT digest(${prefix}::text || ':' || n, 'sha256')
        FROM generate_series(1, ${totalRows}::int) AS input(n)
      )
    `)
  }
}
