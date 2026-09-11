import { describe, it, expect, beforeAll } from 'vitest'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { createImportBatch } from './create-batch.mts'
import {
  getImportBatch,
  getImportRowsByBatchId,
  getImportBatchProgress,
  getImportRowWithBatch,
} from './get-batch.mts'
import { updateRowCompleted, updateRowFailed } from './update-row-status.mts'
import type { PrivateUser } from '@services/users/types'

describe('get-batch', () => {
  const randomSuffix = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser
  let topicId: string

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    topicId = (await createTestTopic({ user: admin })).id
  })

  describe('getImportBatch', () => {
    it('returns batch when found', async () => {
      const suffix = randomSuffix()
      const { batch } = await createImportBatch(admin, 'topic', [{ slug: `get-test-${suffix}` }])

      const fetched = await getImportBatch(batch.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(batch.id)
      expect(fetched!.import_type).toBe('topic')
    })

    it('returns null when batch not found', async () => {
      const fetched = await getImportBatch('00000000-0000-0000-0000-000000000099')
      expect(fetched).toBeNull()
    })

    it('returns null for invalid UUID', async () => {
      const fetched = await getImportBatch('not-a-uuid')
      expect(fetched).toBeNull()
    })
  })

  describe('getImportRowsByBatchId', () => {
    it('returns rows in correct order', async () => {
      const suffix = randomSuffix()
      const { batch } = await createImportBatch(admin, 'topic', [
        { slug: `row-order-a-${suffix}` },
        { slug: `row-order-b-${suffix}` },
        { slug: `row-order-c-${suffix}` },
      ])

      const rows = await getImportRowsByBatchId(batch.id)
      expect(rows).toHaveLength(3)
      expect(rows[0].row_index).toBe(0)
      expect(rows[1].row_index).toBe(1)
      expect(rows[2].row_index).toBe(2)
      expect(rows[0].input_data).toMatchObject({ slug: `row-order-a-${suffix}` })
      expect(rows[2].input_data).toMatchObject({ slug: `row-order-c-${suffix}` })
    })
  })

  describe('getImportBatchProgress', () => {
    it('returns correct counts after completions and failures', async () => {
      const suffix = randomSuffix()
      const { batch, rowIds } = await createImportBatch(admin, 'topic', [
        { slug: `progress-a-${suffix}` },
        { slug: `progress-b-${suffix}` },
        { slug: `progress-c-${suffix}` },
      ])

      await updateRowCompleted(rowIds[0], topicId)
      await updateRowFailed(rowIds[1], 'Something went wrong')

      const progress = await getImportBatchProgress(batch.id)
      expect(progress.total).toBe(3)
      expect(progress.completed).toBe(1)
      expect(progress.failed).toBe(1)
      expect(progress.pending).toBe(1)
    })

    it('returns all pending for fresh batch', async () => {
      const suffix = randomSuffix()
      const { batch } = await createImportBatch(admin, 'topic', [
        { slug: `fresh-a-${suffix}` },
        { slug: `fresh-b-${suffix}` },
      ])

      const progress = await getImportBatchProgress(batch.id)
      expect(progress.total).toBe(2)
      expect(progress.completed).toBe(0)
      expect(progress.failed).toBe(0)
      expect(progress.pending).toBe(2)
    })
  })

  describe('getImportRowWithBatch', () => {
    it('returns row and batch when found', async () => {
      const suffix = randomSuffix()
      const { batch, rows } = await createImportBatch(admin, 'topic', [
        { slug: `row-with-batch-${suffix}` },
      ])

      const result = await getImportRowWithBatch(rows[0].id)
      expect(result).not.toBeNull()
      expect(result!.row.id).toBe(rows[0].id)
      expect(result!.batch.id).toBe(batch.id)
      expect(result!.batch.import_type).toBe('topic')
      expect(result!.batch.created_by_id).toBe(admin.id)
    })

    it('returns null when row not found', async () => {
      const result = await getImportRowWithBatch('00000000-0000-0000-0000-000000000099')
      expect(result).toBeNull()
    })

    it('returns null for invalid UUID', async () => {
      const result = await getImportRowWithBatch('not-a-uuid')
      expect(result).toBeNull()
    })
  })
})
