import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createImportBatch } from './create-batch.mts'
import { getImportBatch, getImportRowsByBatchId } from './get-batch.mts'
import type { PrivateUser } from '@services/users/types'

describe('create-batch', () => {
  const randomSuffix = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  describe('createImportBatch', () => {
    it('creates batch with correct metadata and rows', async () => {
      const suffix = randomSuffix()
      const inputRows = [{ slug: `batch-test-${suffix}`, name: 'Batch Test Topic' }]

      const { batch, rows, rowIds } = await createImportBatch(admin, 'topic', inputRows)

      expect(batch).toHaveProperty('id')
      expect(batch.import_type).toBe('topic')
      expect(batch.created_by_id).toBe(admin.id)
      expect(batch.total_rows).toBe(1)
      expect(batch.completed_rows).toBe(0)
      expect(batch.failed_rows).toBe(0)
      expect(batch.completed_at).toBeNull()
      expect(rows).toHaveLength(1)
      expect(rowIds).toHaveLength(1)
      expect(rowIds[0]).toBe(rows[0].id)
    })

    it('returns correct rowIds for enqueueing', async () => {
      const suffix = randomSuffix()
      const inputRows = [
        { slug: `batch-row-a-${suffix}`, name: 'Row A' },
        { slug: `batch-row-b-${suffix}`, name: 'Row B' },
      ]

      const { rowIds, rows } = await createImportBatch(admin, 'topic', inputRows)

      expect(rowIds).toHaveLength(2)
      expect(rows[0].row_index).toBe(0)
      expect(rows[1].row_index).toBe(1)
      expect(rows[0].input_data).toEqual(inputRows[0])
      expect(rows[1].input_data).toEqual(inputRows[1])
    })

    it('stores metadata when provided', async () => {
      const suffix = randomSuffix()
      const metadata = { source: `test-${suffix}`, version: 1 }

      const { batch } = await createImportBatch(
        admin,
        'topic',
        [{ slug: `meta-test-${suffix}` }],
        metadata,
      )

      const fetched = await getImportBatch(batch.id)
      expect(fetched?.metadata).toMatchObject(metadata)
    })

    it('stores batch in database and is retrievable', async () => {
      const suffix = randomSuffix()
      const { batch } = await createImportBatch(admin, 'topic', [{ slug: `retrieve-${suffix}` }])

      const fetched = await getImportBatch(batch.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(batch.id)
      expect(fetched!.import_type).toBe('topic')

      const fetchedRows = await getImportRowsByBatchId(batch.id)
      expect(fetchedRows).toHaveLength(1)
      expect(fetchedRows[0].input_data).toMatchObject({ slug: `retrieve-${suffix}` })
    })

    it('handles more than 1000 rows without error (chunked insert)', async () => {
      const suffix = randomSuffix()
      const inputRows = Array.from({ length: 1001 }, (_, i) => ({
        url: `https://feed-${suffix}-${i}.example.com/rss`,
      }))

      const { batch, rows, rowIds } = await createImportBatch(admin, 'rss_feed', inputRows)

      expect(batch.total_rows).toBe(1001)
      expect(rows).toHaveLength(1001)
      expect(rowIds).toHaveLength(1001)
      expect(rows[0].row_index).toBe(0)
      expect(rows[1000].row_index).toBe(1000)
    })
  })
})
