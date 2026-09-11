import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { deleteExportsFromS3, expireDataRequests } from '@services/account-data-requests'
import { processCleanupExpiredExports } from './processors.mts'

describe('processCleanupExpiredExports', () => {
  const deleteExports = vi.fn<typeof deleteExportsFromS3>()
  const expireRequests = vi.fn<typeof expireDataRequests>()

  beforeEach(() => {
    vi.clearAllMocks()
    deleteExports.mockResolvedValue(undefined)
  })

  it('expires database records and deletes their S3 objects', async () => {
    expireRequests.mockResolvedValue(['request-1/attempt-1.zip', 'request-2/attempt-2.zip'])
    await runCleanupExpiredExports()
    expect(deleteExports).toHaveBeenCalledWith([
      'request-1/attempt-1.zip',
      'request-2/attempt-2.zip',
    ])
  })

  it('does not call S3 for an empty batch', async () => {
    expireRequests.mockResolvedValue([])
    await runCleanupExpiredExports()
    expect(deleteExports).not.toHaveBeenCalled()
  })

  it('treats a bulk S3 deletion failure as non-fatal', async () => {
    expireRequests.mockResolvedValue(['request-1/attempt-1.zip'])
    deleteExports.mockRejectedValueOnce(new Error('S3 error'))
    await expect(runCleanupExpiredExports()).resolves.toBeUndefined()
  })

  function runCleanupExpiredExports(): Promise<void> {
    return processCleanupExpiredExports({
      deleteExportsFromS3: deleteExports,
      expireDataRequests: expireRequests,
    })
  }
})
