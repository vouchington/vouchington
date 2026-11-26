import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import { copyrightEmailIntakePurpose } from '@services/copyright-notices/email-intakes'
import { upsertMediaTypes } from '@services/urls/media-types'
import { v7 as uuidv7 } from 'uuid'

export const RETAINED_EMAIL_LOOKUP_TIMESTAMP = '2000-01-01T00:00:00.123456Z'
const backgroundCount = 6_000
const chunkSize = 1_000

export async function seedCopyrightRetainedEmailLookup(pageSize: number, senderAddress: string) {
  const visibleCount = 2 * pageSize + 1
  const erasedCount = pageSize / 2
  const foregroundIds = Array.from({ length: visibleCount + erasedCount }, () =>
    uuidv7(),
  ).toSorted()
  const backgroundIds = Array.from({ length: backgroundCount }, () => uuidv7())
  const allIds = [...foregroundIds, ...backgroundIds]
  const erasedIds = foregroundIds.filter((_, index) => (index + 1) % 5 === 0)
  assert.equal(erasedIds.length, erasedCount)
  const erased = new Set(erasedIds)
  const visibleIds = foregroundIds.filter(id => !erased.has(id))
  const rawIds = visibleIds.filter((_, index) => index % 4 === 0)
  const noPointerIds = visibleIds.filter((_, index) => index % 4 === 1)
  const matches = new Set(visibleIds.filter((_, index) => index >= pageSize && index % 4 === 2))
  const prefix = `explain-retained-email/${randomUUID()}/`
  const unparsed = new Set([...rawIds, ...noPointerIds, ...erasedIds])
  const noPointer = new Set([...noPointerIds, ...erasedIds])

  await using transaction = await beginTransaction()
  const mediaType = await upsertMediaTypes('message/rfc822', { query: transaction })
  assert.ok(mediaType)
  for (let start = 0; start < allIds.length; start += chunkSize) {
    const ids = allIds.slice(start, start + chunkSize)
    await transaction(
      `/* seedRetainedEmailLookupStorage */
       INSERT INTO copyright_notice_storage_objects (storage_key)
       SELECT $2::text || id FROM unnest($1::uuid[]) AS fixture(id)`,
      [ids, prefix],
    )
    await transaction(
      `/* seedRetainedEmailLookupReceipts */
       INSERT INTO copyright_notice_email_intake_receipts
         (id, amazon_ses_message_id, raw_sha256, raw_storage_key_sha256, raw_byte_size, erased_at)
       SELECT id, $2::text || id, sha256(uuid_send(id)),
         sha256(convert_to($2::text || id, 'UTF8')), 1,
         CASE WHEN id = ANY($3::uuid[]) THEN CURRENT_TIMESTAMP END
       FROM unnest($1::uuid[]) AS fixture(id)`,
      [ids, prefix, erasedIds],
    )
    await transaction(
      `/* seedRetainedEmailLookupIntakes */
       INSERT INTO copyright_notice_email_intakes
         (id, amazon_ses_message_id, received_at, raw_storage_object_id, raw_sha256,
          raw_media_type_id, raw_byte_size, spf_verdict, dkim_verdict, dmarc_verdict, spam_verdict, virus_verdict)
       SELECT receipt.id, receipt.amazon_ses_message_id,
         CASE WHEN receipt.id = ANY($2::uuid[]) THEN $3::timestamptz ELSE '2001-01-01'::timestamptz END,
         object.id, receipt.raw_sha256, $4::bigint, 1, 'pass', 'pass', 'pass', 'pass', 'pass'
       FROM copyright_notice_email_intake_receipts receipt
       JOIN copyright_notice_storage_objects object ON object.storage_key = receipt.amazon_ses_message_id
       WHERE receipt.id = ANY($1::uuid[])`,
      [ids, foregroundIds, RETAINED_EMAIL_LOOKUP_TIMESTAMP, mediaType],
    )
    const parsedIds = ids.filter(id => !unparsed.has(id))
    const purposes = parsedIds.map(id => copyrightEmailIntakePurpose(prefix + id))
    await transaction(
      `/* seedRetainedEmailLookupParses */
       INSERT INTO copyright_notice_email_intake_parses
         (copyright_notice_email_intake_id, status, sender_email_ciphertext, subject_ciphertext, body_ciphertext)
       SELECT id, 'succeeded', sender, subject, body
       FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[]) AS fixture(id, sender, subject, body)`,
      [
        parsedIds,
        purposes.map((purpose, index) =>
          encryptSecret(
            matches.has(parsedIds[index]!) ? senderAddress.toUpperCase() : 'other@example.test',
            purpose,
          ),
        ),
        purposes.map(purpose => encryptSecret('Synthetic subject', purpose)),
        purposes.map(purpose => encryptSecret('Synthetic message body', purpose)),
      ],
    )
  }
  // Intake admission requires a stored object. Clear only the owned pointers through retention.
  await transaction(`/* permitRetainedEmailLookupPointerErasure */
    SELECT set_config('app.copyright_retention_erasure', 'on', true)`)
  const cleared = await transaction(
    `/* clearRetainedEmailLookupPointers */ UPDATE copyright_notice_email_intakes
     SET raw_storage_object_id = NULL WHERE id = ANY($1::uuid[])`,
    [[...noPointer]],
  )
  assert.equal(cleared.rowCount, noPointer.size)
  await transaction.commit()

  return {
    visibleIds,
    rawIds: new Set(rawIds),
    matches,
    seededRows: {
      copyright_notice_email_intakes: allIds.length,
      copyright_notice_email_intake_receipts: allIds.length,
      copyright_notice_email_intake_parses: allIds.length - unparsed.size,
      copyright_notice_email_intake_notice_links: 0,
    },
    cleanup: async () => {
      await using cleanup = await beginTransaction()
      await cleanup(`/* enableRetainedEmailLookupFixtureCleanup */
        SELECT set_config('app.copyright_operational_retention', 'on', true)`)
      await cleanup(
        `/* deleteRetainedEmailLookupParses */ DELETE FROM copyright_notice_email_intake_parses
         WHERE copyright_notice_email_intake_id = ANY($1::uuid[])`,
        [allIds],
      )
      await cleanup(
        `/* deleteRetainedEmailLookupIntakes */ DELETE FROM copyright_notice_email_intakes
         WHERE id = ANY($1::uuid[])`,
        [allIds],
      )
      await cleanup(
        `/* deleteRetainedEmailLookupStorage */ DELETE FROM copyright_notice_storage_objects
         WHERE storage_key = ANY($1::text[])`,
        [allIds.map(id => prefix + id)],
      )
      // The anti-replay receipts are immutable and stay in the disposable EXPLAIN database.
      await cleanup.commit()
    },
  }
}
