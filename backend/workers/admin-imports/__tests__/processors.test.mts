import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import type {
  getImportRowWithBatch,
  processRssFeedRow,
  processTopicRow,
  updateRowCompleted,
  updateRowFailed,
} from '@services/admin-imports'
import type { getPrivateUserByAny } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import type { publishImportProgress } from '@data-stores/valkey-pubsub'
import { UnrecoverableError } from '@modules/queue-errors'
import { processImportRow } from '../processors.mts'

const captureException = sentryCaptureExceptionMock

const mockGetImportRowWithBatch = vi.fn<typeof getImportRowWithBatch>()
const mockProcessRssFeedRow = vi.fn<typeof processRssFeedRow>()
const mockProcessTopicRow = vi.fn<typeof processTopicRow>()
const mockUpdateRowCompleted = vi.fn<typeof updateRowCompleted>()
const mockUpdateRowFailed = vi.fn<typeof updateRowFailed>()
const mockGetPrivateUserByAny = vi.fn<typeof getPrivateUserByAny>()
const mockPublishImportProgress = vi.fn<typeof publishImportProgress>()

const adminUser = {
  __entity_type: 'user',
  id: 'user-001',
  email: 'tests+processor-mock@voucha.ai',
  roles: [],
  administrator: true,
} as unknown as PrivateUser

function makeRow(overrides?: Record<string, unknown>) {
  return {
    id: 'row-001',
    batch_id: 'batch-001',
    row_index: 0,
    input_data: { url: 'https://example.com/rss' },
    completed_at: null,
    created_entity_id: null,
    failed_at: null,
    error_message: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

const baseProgress = { batchId: 'batch-001', completed: 1, failed: 0, total: 1, done: true }

describe('processImportRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPublishImportProgress.mockResolvedValue(undefined)
  })

  it('publishes progress and resolves on successful rss_feed row', async () => {
    mockGetImportRowWithBatch.mockResolvedValue({
      batch: { id: 'batch-001', import_type: 'rss_feed', created_by_id: 'user-001', metadata: {} },
      row: makeRow(),
    })
    mockGetPrivateUserByAny.mockResolvedValue(adminUser)
    mockProcessRssFeedRow.mockResolvedValue('entity-001')
    mockUpdateRowCompleted.mockResolvedValue(baseProgress)

    await runProcessImportRow('batch-001', 'row-001')

    expect(mockUpdateRowCompleted).toHaveBeenCalledWith('row-001', 'entity-001')
    expect(mockPublishImportProgress).toHaveBeenCalledWith('batch-001', baseProgress)
  })

  it('publishes progress and resolves on successful topic row', async () => {
    const row = makeRow({ input_data: { name: 'Topic name' } })

    mockGetImportRowWithBatch.mockResolvedValue({
      batch: { id: 'batch-001', import_type: 'topic', created_by_id: 'user-001', metadata: {} },
      row,
    })
    mockGetPrivateUserByAny.mockResolvedValue(adminUser)
    mockProcessTopicRow.mockResolvedValue('topic-001')
    mockUpdateRowCompleted.mockResolvedValue(baseProgress)

    await runProcessImportRow('batch-001', 'row-001')

    expect(mockProcessTopicRow).toHaveBeenCalledWith(adminUser, row)
    expect(mockUpdateRowCompleted).toHaveBeenCalledWith('row-001', 'topic-001')
    expect(mockPublishImportProgress).toHaveBeenCalledWith('batch-001', baseProgress)
  })

  it('marks row failed and publishes progress when batch creator is missing', async () => {
    const failProgress = { batchId: 'batch-001', completed: 0, failed: 1, total: 1, done: true }
    mockGetImportRowWithBatch.mockResolvedValue({
      batch: {
        id: 'batch-001',
        import_type: 'rss_feed',
        created_by_id: 'missing-user',
        metadata: {},
      },
      row: makeRow(),
    })
    mockGetPrivateUserByAny.mockResolvedValue(null)
    mockUpdateRowFailed.mockResolvedValue(failProgress)

    await runProcessImportRow('batch-001', 'row-001')

    expect(mockUpdateRowFailed).toHaveBeenCalledWith('row-001', 'Import batch creator not found', {
      isFinalAttempt: true,
    })
    expect(mockPublishImportProgress).toHaveBeenCalledWith('batch-001', failProgress)
    expect(mockProcessRssFeedRow).not.toHaveBeenCalled()
  })

  it('skips processing if row already completed', async () => {
    mockGetImportRowWithBatch.mockResolvedValue({
      batch: { id: 'batch-001', import_type: 'rss_feed', created_by_id: 'user-001', metadata: {} },
      row: makeRow({ completed_at: new Date() }),
    })

    await runProcessImportRow('batch-001', 'row-001')

    expect(mockProcessRssFeedRow).not.toHaveBeenCalled()
    expect(mockUpdateRowCompleted).not.toHaveBeenCalled()
  })

  it('calls updateRowFailed with isFinalAttempt:false and does NOT publish on non-final attempt', async () => {
    mockGetImportRowWithBatch.mockResolvedValue({
      batch: { id: 'batch-001', import_type: 'rss_feed', created_by_id: 'user-001', metadata: {} },
      row: makeRow(),
    })
    mockGetPrivateUserByAny.mockResolvedValue(adminUser)
    mockProcessRssFeedRow.mockRejectedValue(new Error('Transient error'))
    mockUpdateRowFailed.mockResolvedValue(null) // intermediate failure returns null

    await expect(
      runProcessImportRow('batch-001', 'row-001', { isFinalAttempt: false }),
    ).rejects.toThrow('Transient error')

    expect(mockUpdateRowFailed).toHaveBeenCalledWith('row-001', 'Transient error', {
      isFinalAttempt: false,
    })
    expect(mockPublishImportProgress).not.toHaveBeenCalled()
  })

  it('publishes on final attempt failure', async () => {
    const failProgress = { batchId: 'batch-001', completed: 0, failed: 1, total: 1, done: true }
    mockGetImportRowWithBatch.mockResolvedValue({
      batch: { id: 'batch-001', import_type: 'rss_feed', created_by_id: 'user-001', metadata: {} },
      row: makeRow(),
    })
    mockGetPrivateUserByAny.mockResolvedValue(adminUser)
    mockProcessRssFeedRow.mockRejectedValue(new Error('Permanent error'))
    mockUpdateRowFailed.mockResolvedValue(failProgress)

    await expect(
      runProcessImportRow('batch-001', 'row-001', { isFinalAttempt: true }),
    ).rejects.toThrow('Permanent error')

    expect(mockUpdateRowFailed).toHaveBeenCalledWith('row-001', 'Permanent error', {
      isFinalAttempt: true,
    })
    expect(mockPublishImportProgress).toHaveBeenCalledWith('batch-001', failProgress)
  })

  it('handles missing row gracefully (calls onError, does not throw)', async () => {
    mockGetImportRowWithBatch.mockResolvedValue(null)

    await expect(runProcessImportRow('batch-001', 'row-001')).resolves.toBeUndefined()
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it('reports rows that belong to a different batch', async () => {
    mockGetImportRowWithBatch.mockResolvedValue({
      batch: { id: 'batch-002', import_type: 'rss_feed', created_by_id: 'user-001', metadata: {} },
      row: makeRow({ batch_id: 'batch-002' }),
    })

    await expect(runProcessImportRow('batch-001', 'row-001')).resolves.toBeUndefined()

    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Import row row-001 belongs to batch batch-002, not batch-001',
      }),
      expect.objectContaining({
        extra: { batchId: 'batch-001', rowId: 'row-001', actualBatchId: 'batch-002' },
      }),
    )
  })

  it('treats UnrecoverableError as final failure even on non-final attempt', async () => {
    const failProgress = { batchId: 'batch-001', completed: 0, failed: 1, total: 1, done: true }
    mockGetImportRowWithBatch.mockResolvedValue({
      batch: { id: 'batch-001', import_type: 'rss_feed', created_by_id: 'user-001', metadata: {} },
      row: makeRow(),
    })
    mockGetPrivateUserByAny.mockResolvedValue(adminUser)
    mockProcessRssFeedRow.mockRejectedValue(new UnrecoverableError('Invalid URL'))
    mockUpdateRowFailed.mockResolvedValue(failProgress)

    await expect(
      runProcessImportRow('batch-001', 'row-001', { isFinalAttempt: false }),
    ).rejects.toThrow('Invalid URL')

    // Even though isFinalAttempt=false, UnrecoverableError forces isFinalAttempt:true
    expect(mockUpdateRowFailed).toHaveBeenCalledWith('row-001', 'Invalid URL', {
      isFinalAttempt: true,
    })
    expect(mockPublishImportProgress).toHaveBeenCalledWith('batch-001', failProgress)
  })

  it('uses isFinalAttempt:true by default', async () => {
    const failProgress = { batchId: 'batch-001', completed: 0, failed: 1, total: 1, done: true }
    mockGetImportRowWithBatch.mockResolvedValue({
      batch: { id: 'batch-001', import_type: 'rss_feed', created_by_id: 'user-001', metadata: {} },
      row: makeRow(),
    })
    mockGetPrivateUserByAny.mockResolvedValue(adminUser)
    mockProcessRssFeedRow.mockRejectedValue(new Error('Error'))
    mockUpdateRowFailed.mockResolvedValue(failProgress)

    await expect(runProcessImportRow('batch-001', 'row-001')).rejects.toThrow('Error')

    // Default isFinalAttempt=true so publishes progress
    expect(mockPublishImportProgress).toHaveBeenCalled()
  })
})

function runProcessImportRow(
  batchId: string,
  rowId: string,
  options?: { isFinalAttempt?: boolean },
): Promise<void> {
  return processImportRow(batchId, rowId, options, {
    getImportRowWithBatch: mockGetImportRowWithBatch,
    getPrivateUserByAny: mockGetPrivateUserByAny,
    processRssFeedRow: mockProcessRssFeedRow,
    processTopicRow: mockProcessTopicRow,
    publishImportProgress: mockPublishImportProgress,
    updateRowCompleted: mockUpdateRowCompleted,
    updateRowFailed: mockUpdateRowFailed,
  })
}
