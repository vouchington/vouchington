import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import {
  beginTransaction,
  read,
  type QueryInput,
  type QueryValues,
  type TransactionQuery,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import { COPYRIGHT_ERASED_CIPHERTEXT } from '../services/copyright-notices/erased-ciphertext.mts'
import { listCopyrightRetentionEvidenceKeys } from '../services/copyright-notices/retention-erasure-case.mts'
import { upsertMediaTypes } from '../services/urls/media-types.mts'
import { createRetentionMinimalCase } from './services/copyright-notices/retention-minimal-case.mts'

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
export async function beginTestCopyrightStorageObjectOwnershipRace(): Promise<{
  lockIssued: Promise<void>
  listing: Promise<{ id: string; key: string }[]>
  commitWriter: () => Promise<void>
  commitEraser: () => Promise<void>
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
  try {
    await writer(sql`/* insertConcurrentCopyrightEvidenceOwner */
      INSERT INTO copyright_notice_evidence_artifacts
        (copyright_notice_submission_id, storage_object_id, sha256, media_type_id, byte_size)
      VALUES (${second.submissionId}, ${objectId}, ${Buffer.alloc(32, 1)}, ${mediaTypeId}, 1)`)
  } catch (err) {
    await writer[Symbol.asyncDispose]()
    throw err
  }
  const eraser = await beginTransaction()
  const lockIssued = Promise.withResolvers<void>()
  const observingQuery = Object.assign(
    (input: QueryInput, values?: QueryValues) => {
      const pending = eraser(input, values)
      const text = typeof input === 'string' ? input : input.text
      if (text.includes('/* lockCopyrightRetentionEvidenceObjects */')) lockIssued.resolve()
      return pending
    },
    { client: eraser.client },
  ) as TransactionQuery
  const listing = listCopyrightRetentionEvidenceKeys(first.noticeId, observingQuery)
  void listing.then(
    () => lockIssued.reject(new Error('Eraser returned before locking the storage object')),
    err => lockIssued.reject(err),
  )
  return {
    lockIssued: lockIssued.promise,
    listing,
    commitWriter: () => writer.commit(),
    commitEraser: () => eraser.commit(),
    close: async () => {
      await writer[Symbol.asyncDispose]()
      await listing.catch(() => undefined)
      await eraser[Symbol.asyncDispose]()
    },
  }
}
