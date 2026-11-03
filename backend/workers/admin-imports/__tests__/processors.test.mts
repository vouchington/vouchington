import { randomUUID } from 'node:crypto'
import { afterEach, beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser, softDeleteUser } from '@voucha/test-helpers'
import { rejectPostgresWriteForTest } from '@voucha/test-helpers/injected-failures'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { createImportBatch, getImportBatch, getImportRowsByBatchId } from '@services/admin-imports'
import type { PrivateUser } from '@services/users/types'
import { publishImportProgress, subscribeImportProgress } from '@data-stores/valkey-pubsub'
import { UnrecoverableError } from '@vouchington/queue-errors'
import { processImportRow } from '../processors.mts'

type Progress = Parameters<typeof publishImportProgress>[1]

const captureException = sentryCaptureExceptionMock

async function watchProgress(batchId: string): Promise<{ next: () => Promise<Progress> }> {
  const subscription = await subscribeImportProgress(batchId)
  onTestFinished(() => subscription.close())
  const received: Progress[] = []
  const waiting: Array<(chunk: Progress) => void> = []
  subscription.setHandler(chunk => {
    const resolve = waiting.shift()
    if (resolve) resolve(chunk)
    else received.push(chunk)
  })
  return {
    next() {
      const chunk = received.shift()
      if (chunk) return Promise.resolve(chunk)
      return new Promise<Progress>(resolve => {
        waiting.push(resolve)
      })
    },
  }
}

describe('processImportRow', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  afterEach(() => {
    captureException.mockClear()
  })

  it('creates the topic, completes the row, and publishes progress', async () => {
    const slug = `import-processor-${randomUUID()}`
    const { batch, rowIds } = await createImportBatch(admin, 'topic', [{ slug }])
    const progress = await watchProgress(batch.id)

    await processImportRow(batch.id, rowIds[0]!)

    const [row] = await getImportRowsByBatchId(batch.id)
    expect(row!.completed_at).not.toBeNull()
    expect(row!.created_entity_id).toEqual(expect.any(String))
    expect(row!.failed_at).toBeNull()
    await expect(progress.next()).resolves.toEqual({
      batchId: batch.id,
      completed: 1,
      failed: 0,
      total: 1,
      done: true,
    })
  })

  it('marks the row failed and publishes progress when the batch creator is gone', async () => {
    const creator = await createTestUser({ administrator: true })
    const slug = `import-processor-${randomUUID()}`
    const { batch, rowIds } = await createImportBatch(creator, 'topic', [{ slug }])
    await softDeleteUser(creator.id)
    const progress = await watchProgress(batch.id)

    await processImportRow(batch.id, rowIds[0]!)

    const [row] = await getImportRowsByBatchId(batch.id)
    expect(row!.failed_at).not.toBeNull()
    expect(row!.created_entity_id).toBeNull()
    expect(row!.error_message).toBe('Import batch creator not found')
    await expect(progress.next()).resolves.toEqual({
      batchId: batch.id,
      completed: 0,
      failed: 1,
      total: 1,
      done: true,
    })
  })

  it('skips a row that already completed', async () => {
    const slug = `import-processor-${randomUUID()}`
    const { batch, rowIds } = await createImportBatch(admin, 'topic', [{ slug }])
    await processImportRow(batch.id, rowIds[0]!)
    const [completed] = await getImportRowsByBatchId(batch.id)

    await processImportRow(batch.id, rowIds[0]!)

    const [again] = await getImportRowsByBatchId(batch.id)
    expect(again!.created_entity_id).toBe(completed!.created_entity_id)
    expect((await getImportBatch(batch.id))!.completed_rows).toBe(1)
  })

  it('keeps the row pending and publishes nothing on a non-final failure', async () => {
    const { batch, rowIds } = await createImportBatch(admin, 'rss_feed', [{ slug: 'unused' }])
    const progress = await watchProgress(batch.id)

    await expect(processImportRow(batch.id, rowIds[0]!, { isFinalAttempt: false })).rejects.toThrow(
      'Unknown import_type: rss_feed',
    )

    const [row] = await getImportRowsByBatchId(batch.id)
    expect(row!.failed_at).toBeNull()
    expect(row!.error_message).toBe('Unknown import_type: rss_feed')
    const sentinel = { batchId: batch.id, completed: 0, failed: 0, total: 1, done: false }
    await publishImportProgress(batch.id, sentinel)
    await expect(progress.next()).resolves.toEqual(sentinel)
  })

  it('fails the row and publishes progress on the final attempt, which is the default', async () => {
    const { batch, rowIds } = await createImportBatch(admin, 'rss_feed', [{ slug: 'unused' }])
    const progress = await watchProgress(batch.id)

    await expect(processImportRow(batch.id, rowIds[0]!)).rejects.toThrow(
      'Unknown import_type: rss_feed',
    )

    const [row] = await getImportRowsByBatchId(batch.id)
    expect(row!.failed_at).not.toBeNull()
    await expect(progress.next()).resolves.toEqual({
      batchId: batch.id,
      completed: 0,
      failed: 1,
      total: 1,
      done: true,
    })
  })

  it('treats an UnrecoverableError as final even on a non-final attempt', async () => {
    const slug = `import-processor-${randomUUID()}`
    const { batch, rowIds } = await createImportBatch(admin, 'topic', [{ slug }])
    const progress = await watchProgress(batch.id)
    onTestFinished(
      rejectPostgresWriteForTest('createTopicInDatabase', new UnrecoverableError('Invalid URL')),
    )

    await expect(processImportRow(batch.id, rowIds[0]!, { isFinalAttempt: false })).rejects.toThrow(
      'Invalid URL',
    )

    const [row] = await getImportRowsByBatchId(batch.id)
    expect(row!.failed_at).not.toBeNull()
    expect(row!.error_message).toBe('Invalid URL')
    await expect(progress.next()).resolves.toEqual({
      batchId: batch.id,
      completed: 0,
      failed: 1,
      total: 1,
      done: true,
    })
  })

  it('reports a missing row without throwing', async () => {
    const batchId = randomUUID()
    const rowId = randomUUID()

    await expect(processImportRow(batchId, rowId)).resolves.toBeUndefined()

    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: `Import row ${rowId} not found` }),
      expect.objectContaining({ extra: { batchId, rowId } }),
    )
  })

  it('reports a row that belongs to a different batch', async () => {
    const { batch: owner, rowIds } = await createImportBatch(admin, 'topic', [
      { slug: `other-${randomUUID()}` },
    ])
    const { batch: expected } = await createImportBatch(admin, 'topic', [
      { slug: `expected-${randomUUID()}` },
    ])

    await expect(processImportRow(expected.id, rowIds[0]!)).resolves.toBeUndefined()

    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `Import row ${rowIds[0]} belongs to batch ${owner.id}, not ${expected.id}`,
      }),
      expect.objectContaining({
        extra: { batchId: expected.id, rowId: rowIds[0], actualBatchId: owner.id },
      }),
    )
  })
})
