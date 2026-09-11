import { describe, it, expect, beforeAll } from 'vitest'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { createImportBatch } from './create-batch.mts'
import { getImportBatch, getImportRowsByBatchId } from './get-batch.mts'
import { updateRowCompleted, updateRowFailed } from './update-row-status.mts'
import type { PrivateUser } from '@services/users/types'

describe('update-row-status', () => {
  const randomSuffix = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser
  let topicId: string

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    topicId = (await createTestTopic({ user: admin })).id
  })

  describe('updateRowCompleted', () => {
    it('returns RowUpdateProgress with correct counts', async () => {
      const suffix = randomSuffix()
      const { rowIds } = await createImportBatch(admin, 'topic', [
        { slug: `progress-test-a-${suffix}` },
        { slug: `progress-test-b-${suffix}` },
      ])
      const entityId = topicId

      const progress = await updateRowCompleted(rowIds[0]!, entityId)

      expect(progress.batchId).toBeTruthy()
      expect(progress.completed).toBe(1)
      expect(progress.failed).toBe(0)
      expect(progress.total).toBe(2)
      expect(progress.done).toBe(false)
    })

    it('returns done: true when last row completes', async () => {
      const suffix = randomSuffix()
      const { rowIds } = await createImportBatch(admin, 'topic', [{ slug: `done-test-${suffix}` }])
      const entityId = topicId

      const progress = await updateRowCompleted(rowIds[0]!, entityId)

      expect(progress.done).toBe(true)
      expect(progress.completed).toBe(1)
      expect(progress.total).toBe(1)
    })

    it('sets completed_at and created_entity_id', async () => {
      const suffix = randomSuffix()
      const { batch, rowIds } = await createImportBatch(admin, 'topic', [
        { slug: `complete-test-${suffix}` },
      ])
      const entityId = topicId

      await updateRowCompleted(rowIds[0]!, entityId)

      const rows = await getImportRowsByBatchId(batch.id)
      expect(rows[0].completed_at).not.toBeNull()
      expect(rows[0].created_entity_id).toBe(entityId)
      expect(rows[0].failed_at).toBeNull()
    })

    it('auto-completes batch when all rows done', async () => {
      const suffix = randomSuffix()
      const { batch, rowIds } = await createImportBatch(admin, 'topic', [
        { slug: `auto-complete-a-${suffix}` },
        { slug: `auto-complete-b-${suffix}` },
      ])

      await updateRowCompleted(rowIds[0], topicId)
      await updateRowCompleted(rowIds[1], topicId)

      const fetched = await getImportBatch(batch.id)
      expect(fetched!.completed_at).not.toBeNull()
      expect(fetched!.completed_rows).toBe(2)
    })

    it('is idempotent (double-call does not double-count)', async () => {
      const suffix = randomSuffix()
      const { batch, rowIds } = await createImportBatch(admin, 'topic', [
        { slug: `idempotent-complete-${suffix}` },
      ])
      const entityId = topicId

      await updateRowCompleted(rowIds[0], entityId)
      await updateRowCompleted(rowIds[0], entityId)

      const fetched = await getImportBatch(batch.id)
      expect(fetched!.completed_rows).toBe(1)
    })

    it('succeeds after an intermediate retryable error', async () => {
      const suffix = randomSuffix()
      const { batch, rowIds } = await createImportBatch(admin, 'topic', [
        { slug: `retry-success-${suffix}` },
      ])
      const entityId = topicId

      await updateRowFailed(rowIds[0], 'Transient error', { isFinalAttempt: false })
      await updateRowCompleted(rowIds[0], entityId)

      const rows = await getImportRowsByBatchId(batch.id)
      expect(rows[0].completed_at).not.toBeNull()
      expect(rows[0].failed_at).toBeNull()
      expect(rows[0].created_entity_id).toBe(entityId)

      const fetched = await getImportBatch(batch.id)
      expect(fetched!.completed_rows).toBe(1)
      expect(fetched!.failed_rows).toBe(0)
      expect(fetched!.completed_at).not.toBeNull()
    })

    it('does not replace a final failure with success', async () => {
      const suffix = randomSuffix()
      const { batch, rowIds } = await createImportBatch(admin, 'topic', [
        { slug: `terminal-failure-${suffix}` },
      ])

      await updateRowFailed(rowIds[0], 'Final error')
      const progress = await updateRowCompleted(rowIds[0], topicId)

      expect(progress.batchId).toBe('')
      const rows = await getImportRowsByBatchId(batch.id)
      expect(rows[0].completed_at).toBeNull()
      expect(rows[0].failed_at).not.toBeNull()

      const fetched = await getImportBatch(batch.id)
      expect(fetched!.completed_rows).toBe(0)
      expect(fetched!.failed_rows).toBe(1)
    })

    it('rejects a dangling created entity target', async () => {
      const suffix = randomSuffix()
      const { rowIds } = await createImportBatch(admin, 'topic', [
        { slug: `dangling-target-${suffix}` },
      ])

      await expect(
        updateRowCompleted(rowIds[0], '01900000-0000-7000-8000-000000000001'),
      ).rejects.toThrow('foreign key constraint')
    })
  })

  describe('updateRowFailed', () => {
    it('returns RowUpdateProgress with correct failed count (final attempt)', async () => {
      const suffix = randomSuffix()
      const { rowIds } = await createImportBatch(admin, 'topic', [
        { slug: `fail-progress-a-${suffix}` },
        { slug: `fail-progress-b-${suffix}` },
      ])

      const progress = await updateRowFailed(rowIds[0]!, 'Test error')

      expect(progress).not.toBeNull()
      expect(progress!.batchId).toBeTruthy()
      expect(progress!.failed).toBe(1)
      expect(progress!.completed).toBe(0)
      expect(progress!.total).toBe(2)
      expect(progress!.done).toBe(false)
    })

    it('returns null for intermediate failure (isFinalAttempt: false)', async () => {
      const suffix = randomSuffix()
      const { batch, rowIds } = await createImportBatch(admin, 'topic', [
        { slug: `intermediate-fail-${suffix}` },
      ])

      const progress = await updateRowFailed(rowIds[0]!, 'Transient error', {
        isFinalAttempt: false,
      })

      expect(progress).toBeNull()

      // Row should have error_message but NOT failed_at; batch counters unchanged
      const rows = await getImportRowsByBatchId(batch.id)
      expect(rows[0].error_message).toBe('Transient error')
      expect(rows[0].failed_at).toBeNull()
      const fetched = await getImportBatch(batch.id)
      expect(fetched!.failed_rows).toBe(0)
      expect(fetched!.completed_at).toBeNull()
    })

    it('sets failed_at and error_message', async () => {
      const suffix = randomSuffix()
      const { batch, rowIds } = await createImportBatch(admin, 'topic', [
        { slug: `fail-test-${suffix}` },
      ])

      await updateRowFailed(rowIds[0], 'Something went wrong')

      const rows = await getImportRowsByBatchId(batch.id)
      expect(rows[0].failed_at).not.toBeNull()
      expect(rows[0].error_message).toBe('Something went wrong')
      expect(rows[0].completed_at).toBeNull()
    })

    it('auto-completes batch when all rows done (mix of completed and failed)', async () => {
      const suffix = randomSuffix()
      const { batch, rowIds } = await createImportBatch(admin, 'topic', [
        { slug: `mixed-a-${suffix}` },
        { slug: `mixed-b-${suffix}` },
      ])

      await updateRowCompleted(rowIds[0], topicId)
      await updateRowFailed(rowIds[1], 'Error on row 2')

      const fetched = await getImportBatch(batch.id)
      expect(fetched!.completed_at).not.toBeNull()
      expect(fetched!.completed_rows).toBe(1)
      expect(fetched!.failed_rows).toBe(1)
    })

    it('is idempotent (double-call does not double-count)', async () => {
      const suffix = randomSuffix()
      const { batch, rowIds } = await createImportBatch(admin, 'topic', [
        { slug: `idempotent-fail-${suffix}` },
      ])

      await updateRowFailed(rowIds[0], 'Error message')
      await updateRowFailed(rowIds[0], 'Error message again')

      const rows = await getImportRowsByBatchId(batch.id)
      expect(rows[0].error_message).toBe('Error message again')

      const fetched = await getImportBatch(batch.id)
      expect(fetched!.failed_rows).toBe(1)
    })
  })
})
