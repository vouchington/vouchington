import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { COPYRIGHT_ERASED_CIPHERTEXT } from '../services/copyright-notices/erased-ciphertext.mts'
import { eraseCopyrightRetentionCase } from '../services/copyright-notices/retention-erasure-case.mts'
import { upsertMediaTypes } from '../services/urls/media-types.mts'
import { createRetentionMinimalCase } from './services/copyright-notices/retention-minimal-case.mts'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from './postgres-lock-wait.mts'

/** Applies the retention permit to precisely one owned intake, preserving its receipt. */
export async function eraseTestCopyrightEmailIntakeSender(
  intakeId: string,
  eraseOriginal: boolean,
) {
  await using transaction = await beginTransaction()
  await transaction(allowUnannotatedQuery(sql`SET LOCAL app.copyright_retention_erasure = 'on'`))
  await transaction(
    allowUnannotatedQuery(sql`
    UPDATE copyright_notice_email_intake_parses SET sender_email_ciphertext = ${COPYRIGHT_ERASED_CIPHERTEXT}
    WHERE copyright_notice_email_intake_id = ${intakeId}`),
  )
  if (eraseOriginal) {
    await transaction(
      allowUnannotatedQuery(sql`
      UPDATE copyright_notice_email_intakes SET raw_storage_object_id = NULL
      WHERE id = ${intakeId}`),
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
  let lockWaitPromise: Promise<void> | undefined
  try {
    await writer(sql`/* insertConcurrentCopyrightEvidenceOwner */
      INSERT INTO copyright_notice_evidence_artifacts
        (copyright_notice_submission_id, storage_object_id, sha256, media_type_id, byte_size)
      VALUES (${second.submissionId}, ${objectId}, ${Buffer.alloc(32, 1)}, ${mediaTypeId}, 1)`)
    const writerProcessId = await getTestPostgresBackendProcessId(writer)
    const erasure = eraseCopyrightRetentionCase(first.noticeId, options)
    erasurePromise = erasure
    void erasure.catch(() => undefined)
    const lockWait = waitForTestPostgresLockWaiter(
      writerProcessId,
      'lockCopyrightRetentionEvidenceObjects',
    )
    lockWaitPromise = lockWait
    void lockWait.catch(() => undefined)
    return {
      lockWait,
      erasure,
      firstNoticeId: first.noticeId,
      secondNoticeId: second.noticeId,
      storageObjectId: objectId,
      commitWriter: () => writer.commit(),
      close: async () => {
        await writer[Symbol.asyncDispose]()
        await Promise.all([erasure.catch(() => undefined), lockWait.catch(() => undefined)])
      },
    }
  } catch (err) {
    await writer[Symbol.asyncDispose]()
    await erasurePromise?.catch(() => undefined)
    await lockWaitPromise?.catch(() => undefined)
    throw err
  }
}
