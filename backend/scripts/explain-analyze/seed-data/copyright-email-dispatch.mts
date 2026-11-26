import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { upsertMediaTypes } from '@services/urls/media-types'
import { seedUuidAtTimestamp } from './common.mts'

const failedParses = 2_000

export async function seedCopyrightEmailDispatch(timestamp: number, pendingCount: number) {
  const ids = Array.from({ length: failedParses + pendingCount }, (_, i) =>
    seedUuidAtTimestamp(timestamp, i),
  )
  const pendingIds = ids.slice(failedParses)
  const received = new Date(timestamp)
  await using query = await beginTransaction()
  const mediaTypeId = await upsertMediaTypes('message/rfc822', { query })
  const storage = await query(
    `/* seedCopyrightEmailDispatch:storage */
     INSERT INTO copyright_notice_storage_objects (id, storage_key)
     SELECT id, 'explain-dispatch/' || id FROM unnest($1::uuid[]) AS item(id)`,
    [ids],
  )
  assert.equal(storage.rowCount, ids.length)
  const receipts = await query(
    `/* seedCopyrightEmailDispatch:receipts */
     INSERT INTO copyright_notice_email_intake_receipts
       (id, amazon_ses_message_id, raw_sha256, raw_storage_key_sha256, raw_byte_size)
     SELECT id, 'explain-dispatch/' || id, sha256(uuid_send(id)),
       sha256(convert_to('explain-dispatch/' || id, 'UTF8')), 32
     FROM unnest($1::uuid[]) AS item(id)`,
    [ids],
  )
  assert.equal(receipts.rowCount, ids.length)
  const intakes = await query(
    `/* seedCopyrightEmailDispatch:intakes */
     INSERT INTO copyright_notice_email_intakes
       (id, amazon_ses_message_id, received_at, raw_storage_object_id, raw_sha256,
        raw_media_type_id, raw_byte_size, spf_verdict, dkim_verdict, dmarc_verdict,
        spam_verdict, virus_verdict)
     SELECT id, 'explain-dispatch/' || id, $2::timestamptz, id,
       sha256(uuid_send(id)), $3::bigint,
       32, 'pass', 'pass', 'pass', 'pass', 'pass'
     FROM unnest($1::uuid[]) AS item(id)`,
    [ids, received, mediaTypeId],
  )
  assert.equal(intakes.rowCount, ids.length)
  const parses = await query(
    `/* seedCopyrightEmailDispatch:parses */
     INSERT INTO copyright_notice_email_intake_parses
       (copyright_notice_email_intake_id, status, sender_email_ciphertext, subject_ciphertext,
        body_ciphertext, error_ciphertext)
     SELECT id, CASE WHEN parsed THEN 'succeeded'::copyright_notice_email_intake_parse_statuses
         ELSE 'failed'::copyright_notice_email_intake_parse_statuses END,
       CASE WHEN parsed THEN 'v1:synthetic-sender' END,
       CASE WHEN parsed THEN 'v1:synthetic-subject' END,
       CASE WHEN parsed THEN 'v1:synthetic-body' END,
       CASE WHEN NOT parsed THEN 'v1:synthetic-failure' END
     FROM (
       SELECT id, ordinality > $2::integer AS parsed
       FROM unnest($1::uuid[]) WITH ORDINALITY AS item(id, ordinality)
     ) AS fixture`,
    [ids, failedParses],
  )
  assert.equal(parses.rowCount, ids.length)
  await query.commit()

  return {
    pendingIds,
    seededRows: {
      copyright_notice_email_intake_receipts: ids.length,
      copyright_notice_email_intakes: ids.length,
      copyright_notice_email_intake_parses: ids.length,
      copyright_notice_email_intake_notice_links: 0,
    },
    cleanup: async () => {
      await using cleanup = await beginTransaction()
      await cleanup(`/* permitCopyrightEmailDispatchCleanup */
        SELECT set_config('app.copyright_operational_retention', 'on', true)`)
      await cleanup(
        `/* cleanupCopyrightEmailDispatchParses */ DELETE FROM copyright_notice_email_intake_parses
         WHERE copyright_notice_email_intake_id = ANY($1::uuid[])`,
        [ids],
      )
      await cleanup(
        `/* cleanupCopyrightEmailDispatchIntakes */ DELETE FROM copyright_notice_email_intakes
         WHERE id = ANY($1::uuid[])`,
        [ids],
      )
      await cleanup(
        `/* cleanupCopyrightEmailDispatchStorage */ DELETE FROM copyright_notice_storage_objects
         WHERE id = ANY($1::uuid[])`,
        [ids],
      )
      // Replay receipts remain retained by schema. They no longer have operational rows.
      await cleanup.commit()
      await write(`/* analyzeCopyrightEmailDispatchCleanup */
        ANALYZE copyright_notice_email_intakes, copyright_notice_email_intake_parses,
          copyright_notice_email_intake_receipts`)
    },
  }
}
