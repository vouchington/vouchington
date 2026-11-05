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
  writeExportFiles,
  zipDir,
  uploadExportToS3,
  deleteExportFromS3,
  wasDataRequestMadeBySubject,
} from '@services/account-data-requests'
import { getPrivateUserByAny } from '@services/users/get'
import { enqueueSendDataExportReadyEmail } from '@queues/emails/enqueues'
import { DATA_EXPORT_EXPIRY_DAYS } from '@queues/account-lifecycle/config'
import { publishTerminalStatus } from './account-data-request-publish-terminal-status.mts'

export async function processExportRequest(
  requestId: string,
  userId: string,
  processingAttemptId?: string,
  isFinalAttempt = true,
  tempRoot = tmpdir(),
): Promise<void> {
  const started = await markDataRequestProcessing(requestId, processingAttemptId)
  if (!started) return

  let tmpDir: string | undefined
  try {
    tmpDir = await mkdtemp(join(tempRoot, `voucha-export-${requestId}-`))
    const exportDir = join(tmpDir, 'export')
    const zipPath = join(tmpDir, `${requestId}.zip`)

    await writeExportFiles(userId, exportDir)
    await zipDir(exportDir, zipPath)

    const attemptId = processingAttemptId ?? requestId
    const leaseStartedAt = performance.now()
    if (!(await leaseDataRequestUpload(requestId, attemptId))) return

    const uploadTimeRemaining = Math.floor(
      DATA_REQUEST_UPLOAD_LEASE_MS - (performance.now() - leaseStartedAt) - 5_000,
    )
    if (uploadTimeRemaining <= 0) throw new Error('Account data upload lease expired')
    const s3Key = await uploadExportToS3(
      requestId,
      attemptId,
      zipPath,
      AbortSignal.timeout(uploadTimeRemaining),
    )
    try {
      await finishDataRequestUpload(requestId, attemptId)
    } catch {
      // The bounded lease expires naturally; terminal export progress must not depend on this hint.
    }

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + DATA_EXPORT_EXPIRY_DAYS)

    const saved = await markDataRequestReady(requestId, s3Key, expiresAt, processingAttemptId)
    if (!saved) {
      // Account was deleted while export was in-flight; best-effort clean up the orphaned object
      try {
        await deleteExportFromS3(s3Key)
      } catch {
        // Non-fatal: durable deletion work retains the deterministic key for retry.
      }
      return
    }

    // Publish terminal ready state before email so SSE subscribers resolve immediately
    // regardless of how long the email notification takes.
    await publishTerminalStatus(requestId, 'ready')

    // Best-effort: send email notification; do not fail the export if this errors. Only the
    // subject's own export is announced: an administrator-run export must stay invisible to them.
    try {
      const user = (await wasDataRequestMadeBySubject(requestId))
        ? await getPrivateUserByAny(userId)
        : null
      if (user) {
        await enqueueSendDataExportReadyEmail(
          { userId, uiLocale: user.ui_locale ?? null },
          { requestId },
        )
      }
    } catch {
      // Non-fatal: export is ready, notification failure should not mark export as failed
    }
  } catch (err) {
    const failed = await markDataRequestFailed(
      requestId,
      processingAttemptId,
      err instanceof Error ? err.message : String(err),
      isFinalAttempt,
    )
    if (isFinalAttempt && failed) {
      // Publish terminal failed state so SSE subscribers resolve immediately.
      await publishTerminalStatus(requestId, 'failed')
    }
    throw new Error(`Export failed for request ${requestId}`, { cause: err })
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true })
    }
  }
}

export {
  recoverExportRequests,
  processCleanupExpiredExports,
} from './account-data-request-recovery-cleanup.mts'
