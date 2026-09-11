import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  markDataRequestProcessing,
  leaseDataRequestUpload,
  finishDataRequestUpload,
  DATA_REQUEST_UPLOAD_LEASE_MS,
  markDataRequestReady,
  markDataRequestFailed,
  expireDataRequests,
  writeExportFiles,
  zipDir,
  uploadExportToS3,
  deleteExportFromS3,
  deleteExportsFromS3,
  getExportDownloadUrl,
  claimRecoverableDataRequests,
  SEVEN_DAYS_SECONDS,
} from '@services/account-data-requests'
import { enqueueBulkExportRequests } from '@queues/account-data-requests/enqueues'
import { getPrivateUserByAny } from '@services/users/get'
import { enqueueSendDataExportReadyEmail } from '@queues/emails/enqueues'
import { DATA_EXPORT_EXPIRY_DAYS } from '@queues/account-data-requests/config'
import { publishTerminalStatus } from './processors/publish-terminal-status.mts'

export { publishTerminalStatus } from './processors/publish-terminal-status.mts'

type ExportRequestDependencies = {
  deleteExportFromS3: typeof deleteExportFromS3
  enqueueSendDataExportReadyEmail: typeof enqueueSendDataExportReadyEmail
  finishDataRequestUpload: typeof finishDataRequestUpload
  getExportDownloadUrl: typeof getExportDownloadUrl
  getPrivateUserByAny: typeof getPrivateUserByAny
  leaseDataRequestUpload: typeof leaseDataRequestUpload
  markDataRequestFailed: typeof markDataRequestFailed
  markDataRequestProcessing: typeof markDataRequestProcessing
  markDataRequestReady: typeof markDataRequestReady
  publishTerminalStatus: typeof publishTerminalStatus
  uploadExportToS3: typeof uploadExportToS3
  writeExportFiles: typeof writeExportFiles
  zipDir: typeof zipDir
}

type CleanupExpiredExportsDependencies = {
  deleteExportsFromS3: typeof deleteExportsFromS3
  expireDataRequests: typeof expireDataRequests
}

type RecoverExportRequestsDependencies = {
  claimRecoverableDataRequests: typeof claimRecoverableDataRequests
  enqueueBulkExportRequests: typeof enqueueBulkExportRequests
}

export async function processExportRequest(
  requestId: string,
  userId: string,
  dependencies?: Partial<ExportRequestDependencies>,
  processingAttemptId?: string,
  isFinalAttempt = true,
): Promise<void> {
  const deps = {
    deleteExportFromS3,
    enqueueSendDataExportReadyEmail,
    getExportDownloadUrl,
    getPrivateUserByAny,
    finishDataRequestUpload,
    leaseDataRequestUpload,
    markDataRequestFailed,
    markDataRequestProcessing,
    markDataRequestReady,
    publishTerminalStatus,
    uploadExportToS3,
    writeExportFiles,
    zipDir,
    ...dependencies,
  }
  const started = await deps.markDataRequestProcessing(requestId, processingAttemptId)
  if (!started) return

  let tmpDir: string | undefined
  try {
    tmpDir = await mkdtemp(join(tmpdir(), `voucha-export-${requestId}-`))
    const exportDir = join(tmpDir, 'export')
    const zipPath = join(tmpDir, `${requestId}.zip`)

    // ast-grep-ignore: no-three-sequential-awaits -- worker processor performs dependent side effects in order
    await deps.writeExportFiles(userId, exportDir)
    await deps.zipDir(exportDir, zipPath)

    const attemptId = processingAttemptId ?? requestId
    const leaseStartedAt = performance.now()
    if (!(await deps.leaseDataRequestUpload(requestId, attemptId))) return

    const uploadTimeRemaining = Math.floor(
      DATA_REQUEST_UPLOAD_LEASE_MS - (performance.now() - leaseStartedAt) - 5_000,
    )
    if (uploadTimeRemaining <= 0) throw new Error('Account data upload lease expired')
    const s3Key = await deps.uploadExportToS3(
      requestId,
      attemptId,
      zipPath,
      AbortSignal.timeout(uploadTimeRemaining),
    )
    try {
      await deps.finishDataRequestUpload(requestId, attemptId)
    } catch {
      // The bounded lease expires naturally; terminal export progress must not depend on this hint.
    }

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + DATA_EXPORT_EXPIRY_DAYS)

    const saved = await deps.markDataRequestReady(requestId, s3Key, expiresAt, processingAttemptId)
    if (!saved) {
      // Account was deleted while export was in-flight; best-effort clean up the orphaned object
      try {
        await deps.deleteExportFromS3(s3Key)
      } catch {
        // Non-fatal: durable deletion work retains the deterministic key for retry.
      }
      return
    }

    // Publish terminal ready state before email so SSE subscribers resolve immediately
    // regardless of how long the email notification takes.
    await deps.publishTerminalStatus(requestId, 'ready')

    // Best-effort: send email notification; do not fail the export if this errors
    try {
      const user = await deps.getPrivateUserByAny(userId)
      if (user) {
        const downloadUrl = await deps.getExportDownloadUrl(s3Key, SEVEN_DAYS_SECONDS)
        await deps.enqueueSendDataExportReadyEmail(
          { userId },
          {
            downloadUrl,
            expiresInDays: DATA_EXPORT_EXPIRY_DAYS,
            uiLocale: user.ui_locale ?? null,
          },
        )
      }
    } catch {
      // Non-fatal: export is ready, notification failure should not mark export as failed
    }
  } catch (err) {
    const failed = await deps.markDataRequestFailed(
      requestId,
      processingAttemptId,
      err instanceof Error ? err.message : String(err),
      isFinalAttempt,
    )
    if (isFinalAttempt && failed) {
      // Publish terminal failed state so SSE subscribers resolve immediately.
      await deps.publishTerminalStatus(requestId, 'failed')
    }
    throw new Error(`Export failed for request ${requestId}`, { cause: err })
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true })
    }
  }
}

export async function recoverExportRequests(
  dependencies?: Partial<RecoverExportRequestsDependencies>,
): Promise<{ enqueued: number }> {
  const claimRequests = dependencies?.claimRecoverableDataRequests ?? claimRecoverableDataRequests
  const enqueueRequests = dependencies?.enqueueBulkExportRequests ?? enqueueBulkExportRequests
  const requests = await claimRequests()
  if (requests.length > 0) await enqueueRequests(requests)
  return { enqueued: requests.length }
}

export async function processCleanupExpiredExports(
  dependencies?: Partial<CleanupExpiredExportsDependencies>,
): Promise<void> {
  const expireRequests = dependencies?.expireDataRequests ?? expireDataRequests
  const deleteExports = dependencies?.deleteExportsFromS3 ?? deleteExportsFromS3
  const s3Keys = await expireRequests()
  if (s3Keys.length === 0) return
  try {
    await deleteExports(s3Keys)
  } catch {
    // Non-fatal: S3 lifecycle will eventually reclaim failed objects.
  }
}
