import {
  beginTransaction,
  read,
  type QueryInput,
  type QueryValues,
  type TransactionQuery,
} from '@data-stores/psql'
import { upsertMediaTypes } from '@services/urls/media-types'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import sql from 'sql-template-strings'
import { describe, expect, it } from 'vitest'
import { listCopyrightRetentionEvidenceKeys } from './retention-erasure-case.mts'

describe('copyright storage-object ownership locks', () => {
  it('sees a new owner after waiting on the object row before returning a key for S3 deletion', async () => {
    const first = await createRetentionMinimalCase({ artifacts: 1 })
    const second = await createRetentionMinimalCase()
    const { rows: objects } = await read<{ id: string }>(sql`/* readRetentionObjectLockFixture */
    SELECT id FROM copyright_notice_storage_objects WHERE storage_key = ${first.evidenceKeys[0]}`)
    const objectId = objects[0]?.id
    if (!objectId) throw new Error('Owned storage object missing')
    const mediaTypeId = await upsertMediaTypes('application/pdf')

    await using writer = await beginTransaction()
    await writer(sql`/* insertConcurrentCopyrightEvidenceOwner */
    INSERT INTO copyright_notice_evidence_artifacts
      (copyright_notice_submission_id, storage_object_id, sha256, media_type_id, byte_size)
    VALUES (${second.submissionId}, ${objectId}, ${Buffer.alloc(32, 1)}, ${mediaTypeId}, 1)`)
    // The uncommitted FK writer holds KEY SHARE. The eraser must wait for its commit.
    await using eraser = await beginTransaction()
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
    await lockIssued.promise
    await writer.commit()
    expect(await listing).toEqual([])
    await eraser.commit()
  })
})
