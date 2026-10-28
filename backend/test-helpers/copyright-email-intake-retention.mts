import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { COPYRIGHT_ERASED_CIPHERTEXT } from '../services/copyright-notices/erased-ciphertext.mts'
import { eraseCopyrightRetentionCase } from '../services/copyright-notices/retention-erasure-case.mts'
import { upsertMediaTypes } from '../services/urls/media-types.mts'
import { createRetentionMinimalCase } from './services/copyright-notices/retention-minimal-case.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** Applies the retention permit to precisely one owned intake, preserving its receipt. */
export async function eraseTestCopyrightEmailIntakeSender(
  intakeId: string,
  eraseOriginal: boolean,
) {
  await using transaction = await beginTransaction()
  await transaction(
    sql`/* eraseTestCopyrightEmailIntakeSender:permit */ SET LOCAL app.copyright_retention_erasure = 'on'`,
  )
  await transaction(
    sql`/* eraseTestCopyrightEmailIntakeSender:eraseSender */
    UPDATE copyright_notice_email_intake_parses SET sender_email_ciphertext = ${COPYRIGHT_ERASED_CIPHERTEXT}
    WHERE copyright_notice_email_intake_id = ${intakeId}`,
  )
  if (eraseOriginal) {
    await transaction(
      sql`/* eraseTestCopyrightEmailIntakeSender:eraseOriginal */
      UPDATE copyright_notice_email_intakes SET raw_storage_object_id = NULL
      WHERE id = ${intakeId}`,
    )
  }
  await transaction.commit()
}

/** Hold a second owner's FK lock while the real erasure query tries to lock the object. */
export async function beginTestCopyrightStorageObjectOwnershipRace(
  options: Parameters<typeof eraseCopyrightRetentionCase>[1],
): Promise<{
  lockWait: Promise<void>
  erasure: ReturnType<typeof eraseCopyrightRetentionCase>
  firstNoticeId: string
  secondNoticeId: string
  storageObjectId: string
  commitWriter: () => Promise<void>
  close: () => Promise<void>
}> {
  const first = await createRetentionMinimalCase({ artifacts: 1 })
  const second = await createRetentionMinimalCase()
  const { rows: objects } = await read<{ id: string }>(sql`/* readRetentionObjectLockFixture */
    SELECT id FROM copyright_notice_storage_objects WHERE storage_key = ${first.evidenceKeys[0]}`)
  const objectId = objects[0]?.id
  if (!objectId) throw new Error('Owned storage object missing')
  const mediaTypeId = await upsertMediaTypes('application/pdf')

  const writer = await beginTransaction()
  let erasurePromise: ReturnType<typeof eraseCopyrightRetentionCase> | undefined
  const lockWaitEvent = Promise.withResolvers<void>()
  const writerCommitGate = Promise.withResolvers<void>()
  let writerFinalization: Promise<void> | undefined
  let observation: Promise<void> | undefined
  let closePromise: Promise<void> | undefined
  void lockWaitEvent.promise.catch(() => {})
  void writerCommitGate.promise.catch(() => {})
  const commitWriter = () => {
    writerFinalization ??= (async () => {
      try {
        await writer.commit()
      } catch (err) {
        try {
          await writer[Symbol.asyncDispose]()
        } catch (err_) {
          throw new SuppressedError(err, err_, 'Copyright writer commit and rollback failed')
        }
        throw err
      } finally {
        writerCommitGate.resolve()
      }
    })()
    return writerFinalization
  }
  const releaseWriter = () => {
    writerFinalization ??= (async () => {
      try {
        await writer[Symbol.asyncDispose]()
      } finally {
        writerCommitGate.resolve()
      }
    })()
    return writerFinalization
  }
  try {
    await writer(sql`/* insertConcurrentCopyrightEvidenceOwner */
      INSERT INTO copyright_notice_evidence_artifacts
        (copyright_notice_submission_id, storage_object_id, sha256, media_type_id, byte_size)
      VALUES (${second.submissionId}, ${objectId}, ${Buffer.alloc(32, 1)}, ${mediaTypeId}, 1)`)
    const writerProcessId = await getTestPostgresBackendProcessId(writer)
    observation = withTestOwnedPostgresWait(
      {
        holderProcessId: writerProcessId,
        lock: { kind: 'transaction' },
        pool: 'write',
        queryMarker: 'lockCopyrightRetentionEvidenceObjects',
        releaseHolder: releaseWriter,
      },
      async waitForLock => {
        const erasure = eraseCopyrightRetentionCase(first.noticeId, options)
        erasurePromise = erasure
        void erasure.catch(() => undefined)
        await waitForLock(erasure)
        lockWaitEvent.resolve()
        await writerCommitGate.promise
      },
    )
    void observation.catch(lockWaitEvent.reject)
    await lockWaitEvent.promise
    if (!erasurePromise) throw new Error('Copyright erasure did not start after lock observation')
    return {
      lockWait: lockWaitEvent.promise,
      erasure: erasurePromise,
      firstNoticeId: first.noticeId,
      secondNoticeId: second.noticeId,
      storageObjectId: objectId,
      commitWriter,
      close: () =>
        (closePromise ??= (async () => {
          await releaseWriter()
          writerCommitGate.resolve()
          await Promise.all([
            erasurePromise?.catch(() => undefined),
            lockWaitEvent.promise.catch(() => undefined),
            observation?.catch(() => undefined),
          ])
        })()),
    }
  } catch (err) {
    await releaseWriter()
    writerCommitGate.resolve()
    await erasurePromise?.catch(() => undefined)
    await observation?.catch(() => undefined)
    await lockWaitEvent.promise.catch(() => undefined)
    throw err
  }
}
