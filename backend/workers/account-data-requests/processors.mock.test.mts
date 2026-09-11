import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import * as fsPromises from 'node:fs/promises'
import type {
  deleteExportFromS3,
  finishDataRequestUpload,
  getExportDownloadUrl,
  leaseDataRequestUpload,
  markDataRequestFailed,
  markDataRequestProcessing,
  markDataRequestReady,
  uploadExportToS3,
  writeExportFiles,
  zipDir,
} from '@services/account-data-requests'
import type { getPrivateUserByAny } from '@services/users/get'
import type { enqueueSendDataExportReadyEmail } from '@queues/emails/enqueues'
import { dataRequestPubSub } from '@data-stores/valkey-pubsub'
import { processExportRequest, publishTerminalStatus } from './processors.mts'

vi.mock<typeof import('node:fs/promises')>(import('node:fs/promises'), () => ({
  mkdtemp: vi.fn<VitestLooseMock>(),
  rm: vi.fn<VitestLooseMock>(),
}))

const mockDeleteExportFromS3 = vi.fn<typeof deleteExportFromS3>()
const mockFinishDataRequestUpload = vi.fn<typeof finishDataRequestUpload>()
const mockEnqueueSendDataExportReadyEmail = vi.fn<typeof enqueueSendDataExportReadyEmail>()
const mockGetExportDownloadUrl = vi.fn<typeof getExportDownloadUrl>()
const mockGetPrivateUserByAny = vi.fn<typeof getPrivateUserByAny>()
const mockLeaseDataRequestUpload = vi.fn<typeof leaseDataRequestUpload>()
const mockMarkDataRequestFailed = vi.fn<typeof markDataRequestFailed>()
const mockMarkDataRequestProcessing = vi.fn<typeof markDataRequestProcessing>()
const mockMarkDataRequestReady = vi.fn<typeof markDataRequestReady>()
const mockPublishTerminalStatus =
  vi.fn<(requestId: string, status: 'ready' | 'failed') => Promise<void>>()
const mockUploadExportToS3 = vi.fn<typeof uploadExportToS3>()
const mockWriteExportFiles = vi.fn<typeof writeExportFiles>()
const mockZipDir = vi.fn<typeof zipDir>()
const PROCESSING_ATTEMPT_ID = 'attempt-456'

describe('processExportRequest', () => {
  const requestId = 'request-123'
  const userId = 'user-123'
  const tmpDir = '/tmp/voucha-export-request-123-abc'
  const exportDir = join(tmpDir, 'export')
  const zipPath = join(tmpDir, `${requestId}.zip`)
  const s3Key = `${requestId}/${PROCESSING_ATTEMPT_ID}.zip`

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fsPromises.mkdtemp).mockResolvedValue(tmpDir)
    vi.mocked(fsPromises.rm).mockResolvedValue(undefined)
    mockDeleteExportFromS3.mockResolvedValue(undefined)
    mockFinishDataRequestUpload.mockResolvedValue(undefined)
    mockEnqueueSendDataExportReadyEmail.mockResolvedValue(true)
    mockGetExportDownloadUrl.mockResolvedValue('https://s3.example.com/signed')
    mockGetPrivateUserByAny.mockResolvedValue({
      id: userId,
      __entity_type: 'user',
      roles: [],
      email_address: 'tests+user@voucha.ai',
      ui_locale: 'fr',
    } as never)
    mockLeaseDataRequestUpload.mockResolvedValue(new Date(Date.now() + 60_000))
    mockMarkDataRequestFailed.mockResolvedValue(true)
    mockMarkDataRequestProcessing.mockResolvedValue(true)
    mockMarkDataRequestReady.mockResolvedValue(true)
    mockPublishTerminalStatus.mockResolvedValue(undefined)
    mockUploadExportToS3.mockResolvedValue(s3Key)
    mockWriteExportFiles.mockResolvedValue(undefined)
    mockZipDir.mockResolvedValue(undefined)
  })

  it('uploads zip to S3 and marks request ready', async () => {
    await runExportRequest(requestId, userId)

    expect(mockLeaseDataRequestUpload).toHaveBeenCalledWith(requestId, PROCESSING_ATTEMPT_ID)
    expect(mockUploadExportToS3).toHaveBeenCalledWith(
      requestId,
      PROCESSING_ATTEMPT_ID,
      zipPath,
      expect.any(AbortSignal),
    )
    expect(mockFinishDataRequestUpload).toHaveBeenCalledWith(requestId, PROCESSING_ATTEMPT_ID)
    expect(mockMarkDataRequestReady).toHaveBeenCalledWith(
      requestId,
      s3Key,
      expect.any(Date),
      PROCESSING_ATTEMPT_ID,
    )
  })

  it('enqueues a user-targeted email notification when the user exists', async () => {
    await runExportRequest(requestId, userId)

    expect(mockGetExportDownloadUrl).toHaveBeenCalledWith(s3Key, 604800)
    expect(mockEnqueueSendDataExportReadyEmail).toHaveBeenCalledWith(
      { userId },
      { downloadUrl: 'https://s3.example.com/signed', expiresInDays: 7, uiLocale: 'fr' },
    )
  })

  it('enqueues a user-targeted email when the user has no email address', async () => {
    mockGetPrivateUserByAny.mockResolvedValue({
      id: userId,
      __entity_type: 'user',
      roles: [],
      email_address: undefined,
    } as never)

    await runExportRequest(requestId, userId)

    expect(mockEnqueueSendDataExportReadyEmail).toHaveBeenCalledWith(
      { userId },
      { downloadUrl: 'https://s3.example.com/signed', expiresInDays: 7, uiLocale: null },
    )
  })

  it('skips email when user is not found', async () => {
    mockGetPrivateUserByAny.mockResolvedValue(null)

    await runExportRequest(requestId, userId)

    expect(mockEnqueueSendDataExportReadyEmail).not.toHaveBeenCalled()
  })

  it('cleans up tmp dir on success', async () => {
    await runExportRequest(requestId, userId)

    expect(mockWriteExportFiles).toHaveBeenCalledWith(userId, exportDir)
    expect(mockZipDir).toHaveBeenCalledWith(exportDir, zipPath)
    expect(fsPromises.rm).toHaveBeenCalledWith(tmpDir, { recursive: true, force: true })
  })

  it('does not start if markDataRequestProcessing returns false', async () => {
    mockMarkDataRequestProcessing.mockResolvedValue(false)

    await runExportRequest(requestId, userId)

    expect(mockWriteExportFiles).not.toHaveBeenCalled()
  })

  it('does not upload if deletion wins before the provider-effect lease', async () => {
    mockLeaseDataRequestUpload.mockResolvedValue(null)

    await runExportRequest(requestId, userId)

    expect(mockUploadExportToS3).not.toHaveBeenCalled()
    expect(mockFinishDataRequestUpload).not.toHaveBeenCalled()
    expect(mockMarkDataRequestFailed).not.toHaveBeenCalled()
  })

  it('marks request failed and cleans up tmp dir on error', async () => {
    mockUploadExportToS3.mockRejectedValue(new Error('S3 upload failed'))

    await expect(runExportRequest(requestId, userId)).rejects.toThrow(
      `Export failed for request ${requestId}`,
    )

    expect(mockMarkDataRequestFailed).toHaveBeenCalledWith(
      requestId,
      PROCESSING_ATTEMPT_ID,
      'S3 upload failed',
      true,
    )
    expect(mockPublishTerminalStatus).toHaveBeenCalledWith(requestId, 'failed')
    expect(mockFinishDataRequestUpload).not.toHaveBeenCalled()
    expect(fsPromises.rm).toHaveBeenCalledWith(tmpDir, { recursive: true, force: true })
  })

  it.each([
    { finalAttempt: false, lifecycleSaved: true },
    { finalAttempt: true, lifecycleSaved: false },
  ])(
    'does not publish a non-terminal or stale failure',
    async ({ finalAttempt, lifecycleSaved }) => {
      mockUploadExportToS3.mockRejectedValue(new Error('S3 upload failed'))
      mockMarkDataRequestFailed.mockResolvedValue(lifecycleSaved)

      await expect(
        processExportRequest(
          requestId,
          userId,
          getExportRequestDependencies(),
          PROCESSING_ATTEMPT_ID,
          finalAttempt,
        ),
      ).rejects.toThrow(`Export failed for request ${requestId}`)

      expect(mockMarkDataRequestFailed).toHaveBeenCalledWith(
        requestId,
        PROCESSING_ATTEMPT_ID,
        'S3 upload failed',
        finalAttempt,
      )
      expect(mockPublishTerminalStatus).not.toHaveBeenCalled()
    },
  )

  it('deletes orphaned S3 object when markDataRequestReady returns false (account deleted)', async () => {
    mockMarkDataRequestReady.mockResolvedValue(false)

    await runExportRequest(requestId, userId)

    expect(mockDeleteExportFromS3).toHaveBeenCalledWith(s3Key)
    expect(mockMarkDataRequestFailed).not.toHaveBeenCalled()
    expect(mockEnqueueSendDataExportReadyEmail).not.toHaveBeenCalled()
  })

  it('publishes ready status when the settled-upload lease release fails', async () => {
    mockFinishDataRequestUpload.mockRejectedValue(new Error('database unavailable'))

    await expect(runExportRequest(requestId, userId)).resolves.toBeUndefined()

    expect(mockMarkDataRequestReady).toHaveBeenCalled()
    expect(mockPublishTerminalStatus).toHaveBeenCalledWith(requestId, 'ready')
  })

  it('does not throw when orphaned S3 delete fails after markDataRequestReady returns false', async () => {
    mockMarkDataRequestReady.mockResolvedValue(false)
    mockDeleteExportFromS3.mockRejectedValue(new Error('S3 error'))

    await expect(runExportRequest(requestId, userId)).resolves.toBeUndefined()
    expect(mockMarkDataRequestFailed).not.toHaveBeenCalled()
  })

  it('resolves successfully when getPrivateUserByAny rejects (best-effort email)', async () => {
    mockGetPrivateUserByAny.mockRejectedValue(new Error('DB error'))

    await expect(runExportRequest(requestId, userId)).resolves.toBeUndefined()
    expect(mockMarkDataRequestFailed).not.toHaveBeenCalled()
    expect(mockEnqueueSendDataExportReadyEmail).not.toHaveBeenCalled()
  })

  it('resolves successfully when getExportDownloadUrl rejects (best-effort email)', async () => {
    mockGetExportDownloadUrl.mockRejectedValue(new Error('Sign error'))

    await expect(runExportRequest(requestId, userId)).resolves.toBeUndefined()
    expect(mockMarkDataRequestFailed).not.toHaveBeenCalled()
    expect(mockEnqueueSendDataExportReadyEmail).not.toHaveBeenCalled()
  })

  it('resolves successfully when email enqueue rejects (best-effort email)', async () => {
    mockEnqueueSendDataExportReadyEmail.mockRejectedValue(new Error('enqueue failed'))

    await expect(runExportRequest(requestId, userId)).resolves.toBeUndefined()
    expect(mockMarkDataRequestFailed).not.toHaveBeenCalled()
    expect(mockEnqueueSendDataExportReadyEmail).toHaveBeenCalled()
  })
})

describe('publishTerminalStatus', () => {
  it('retries default pub/sub publisher and reports the terminal failure', async () => {
    const reportError = vi.fn<(error: Error) => void>()
    const publish = vi
      .spyOn(dataRequestPubSub, 'publish')
      .mockRejectedValue('publish failed' as never)

    try {
      await publishTerminalStatus('request-terminal', 'failed', { onError: reportError })

      expect(publish).toHaveBeenCalledTimes(3)
      expect(publish).toHaveBeenCalledWith('request-terminal', { status: 'failed' })
      expect(reportError).toHaveBeenCalledWith(expect.any(Error))
    } finally {
      publish.mockRestore()
    }
  })
})

function runExportRequest(requestId: string, userId: string): Promise<void> {
  return processExportRequest(
    requestId,
    userId,
    getExportRequestDependencies(),
    PROCESSING_ATTEMPT_ID,
  )
}

function getExportRequestDependencies() {
  return {
    deleteExportFromS3: mockDeleteExportFromS3,
    enqueueSendDataExportReadyEmail: mockEnqueueSendDataExportReadyEmail,
    finishDataRequestUpload: mockFinishDataRequestUpload,
    getExportDownloadUrl: mockGetExportDownloadUrl,
    getPrivateUserByAny: mockGetPrivateUserByAny,
    leaseDataRequestUpload: mockLeaseDataRequestUpload,
    markDataRequestFailed: mockMarkDataRequestFailed,
    markDataRequestProcessing: mockMarkDataRequestProcessing,
    markDataRequestReady: mockMarkDataRequestReady,
    publishTerminalStatus: mockPublishTerminalStatus,
    uploadExportToS3: mockUploadExportToS3,
    writeExportFiles: mockWriteExportFiles,
    zipDir: mockZipDir,
  }
}
