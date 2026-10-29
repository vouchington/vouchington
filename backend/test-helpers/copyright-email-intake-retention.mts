import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { COPYRIGHT_ERASED_CIPHERTEXT } from '../services/copyright-notices/erased-ciphertext.mts'
import { eraseCopyrightRawObjectPage } from '../services/copyright-notices/retention-erasure-objects.mts'
import { upsertMediaTypes } from '../services/urls/media-types.mts'
import { createRetentionMinimalCase } from './services/copyright-notices/retention-minimal-case.mts'

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

/** Hold a second owner's FK lock while the real bounded erasure page locks the object. */
export async function beginTestCopyrightStorageObjectOwnershipRace(
  createWriter = beginTransaction,
): Promise<{
  lockWait: Promise<void>
  erasure: Promise<void>
  commitWriter: () => Promise<void>
  commitEraser: () => Promise<void>
  readObjectState: () => Promise<{ erasedAt: Date | null; referenceCount: number }>
  close: () => Promise<void>
}> {
  const first = await createRetentionMinimalCase({ artifacts: 1 })
  const second = await createRetentionMinimalCase()
  const { rows: objects } = await read<{ id: string }>(sql`/* readRetentionObjectLockFixture */
    SELECT id FROM copyright_notice_storage_objects WHERE storage_key = ${first.evidenceKeys[0]}`)
  const objectId = objects[0]?.id
  if (!objectId) throw new Error('Owned storage object missing')
  const mediaTypeId = await upsertMediaTypes('application/pdf')

  await using setup = await beginTransaction()
  await setup(sql`/* seedCopyrightRawObjectErasureContinuation */
    INSERT INTO copyright_notice_minimal_purge_continuations (
      copyright_notice_identity_id, legal_clock_at, erasure_started_at, erasure_legal_clock_at,
      erasure_stage_index, erasure_table_index
    ) VALUES (${first.noticeId}, clock_timestamp(), clock_timestamp(), clock_timestamp(), 1, 1)
    ON CONFLICT (copyright_notice_identity_id) DO UPDATE SET
      erasure_started_at = EXCLUDED.erasure_started_at,
      erasure_legal_clock_at = EXCLUDED.erasure_legal_clock_at,
      erasure_stage_index = 1, erasure_table_index = 1,
      erasure_object_owner_cursor = NULL, erased_object_count = 0`)
  await setup.commit()

  const writer = await createWriter()
  let eraser: Awaited<ReturnType<typeof beginTransaction>>
  let writerProcessId: number
  try {
    await writer(sql`/* insertConcurrentCopyrightEvidenceOwner */
      INSERT INTO copyright_notice_evidence_artifacts
        (copyright_notice_submission_id, storage_object_id, sha256, media_type_id, byte_size)
      VALUES (${second.submissionId}, ${objectId}, ${Buffer.alloc(32, 1)}, ${mediaTypeId}, 1)`)
    writerProcessId = await getTestPostgresBackendProcessId(writer)
    eraser = await beginTransaction()
  } catch (err) {
    await writer[Symbol.asyncDispose]()
    throw err
  }
  const lockWait = Promise.withResolvers<void>()
  const writerReleased = Promise.withResolvers<void>()
  let erasure: Promise<void> | undefined
  const releaseWriter = async () => {
    try {
      await writer[Symbol.asyncDispose]()
    } finally {
      writerReleased.resolve()
    }
  }
  const observation = withTestOwnedPostgresWait(
    {
      holderProcessId: writerProcessId,
      lock: { kind: 'transaction' },
      pool: 'write',
      queryMarker: 'lockCopyrightErasureObjectPage',
      releaseHolder: releaseWriter,
    },
    async waitForLock => {
      erasure = eraseCopyrightRawObjectPage(
        eraser,
        first.noticeId,
        {
          erasure_started_at: new Date(),
          erasure_legal_clock_at: new Date(),
          erasure_stage_index: 1,
          erasure_table_index: 1,
          erasure_intake_cursor: null,
          erasure_object_owner_cursor: null,
          erased_object_count: 0,
        },
        10,
      )
      await waitForLock(erasure)
      lockWait.resolve()
      await writerReleased.promise
    },
  )
  void observation.catch(lockWait.reject)
  try {
    await lockWait.promise
  } catch (err) {
    await releaseWriter()
    await erasure?.catch(() => undefined)
    await eraser[Symbol.asyncDispose]()
    throw err
  }
  return {
    lockWait: lockWait.promise,
    erasure: erasure!,
    commitWriter: async () => {
      try {
        await writer.commit()
      } finally {
        writerReleased.resolve()
      }
    },
    commitEraser: () => eraser.commit(),
    readObjectState: async () => {
      const { rows } = await read<{ erased_at: Date | null; reference_count: number }>(sql`
        /* readCopyrightRawObjectAfterRetentionRace */
        SELECT object.erased_at,
          (SELECT count(*)::integer FROM copyright_notice_evidence_artifacts artifact
            WHERE artifact.storage_object_id = object.id)
          + (SELECT count(*)::integer FROM copyright_notice_email_intakes intake
            WHERE intake.raw_storage_object_id = object.id) AS reference_count
        FROM copyright_notice_storage_objects object WHERE object.id = ${objectId}`)
      const state = rows[0]
      if (!state) throw new Error('Owned storage-object registry row disappeared')
      return { erasedAt: state.erased_at, referenceCount: state.reference_count }
    },
    close: async () => {
      await releaseWriter()
      await erasure?.catch(() => undefined)
      await observation.catch(() => undefined)
      await eraser[Symbol.asyncDispose]()
    },
  }
}
