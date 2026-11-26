import { beginTransaction } from '@data-stores/psql'
import { DEFAULT_DATA_RETENTION_CONFIG } from '@services/data-retention/config'
import { seedUuidAtTimestamp } from '../seed-data/common.mts'

export const attachmentRelation = 'copyright_notice_email_intake_attachments'
const older = Date.UTC(2001, 0, 1)
const recent = Date.UTC(2001, 5, 1)
export const targetIntake = seedUuidAtTimestamp(older, 970_000)
const otherIntakes = Array.from({ length: 200 }, (_, index) =>
  seedUuidAtTimestamp(recent, 971_000 + index),
)
const intakeIds = [targetIntake, ...otherIntakes]
// The intake parser allows 100 attachments. Recommendations can consume 401 of the live
// sweep's 500 child deletions before it reaches attachments.
const attachmentLimit = 100
const earlierChildDeletes = 401
export const attachmentPageSize = DEFAULT_DATA_RETENTION_CONFIG.batch_size - earlierChildDeletes
export const targetAttachments = Array.from({ length: attachmentLimit }, (_, index) =>
  seedUuidAtTimestamp(older, 981_000 + index),
)
const unrelatedAttachmentsPerIntake = 10
export const unrelatedAttachments = Array.from(
  { length: otherIntakes.length * unrelatedAttachmentsPerIntake },
  (_, index) => seedUuidAtTimestamp(recent, 1_000_000 + index),
)
const attachmentIds = [...targetAttachments, ...unrelatedAttachments]
const attachmentOwners = [
  ...targetAttachments.map(() => targetIntake),
  ...otherIntakes.flatMap(id => Array<string>(unrelatedAttachmentsPerIntake).fill(id)),
]
export const emailChildDeleteSetting = 'app.copyright_operational_retention'
export const enableEmailChildDelete = `/* enableUnlinkedEmailChildFixtureRetention */ SET LOCAL ${emailChildDeleteSetting} = 'on'`

/** Durable receipt and storage anchors remain reusable on repeat runs of the disposable harness. */
export async function seedCopyrightUnlinkedEmailRetention(): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* seedCopyrightUnlinkedEmailRetentionReceipts */
     INSERT INTO copyright_notice_email_intake_receipts
       (id, amazon_ses_message_id, raw_sha256, raw_storage_key_sha256, raw_byte_size)
     SELECT id, 'explain-unlinked-' || id, sha256(uuid_send(id)), sha256(uuid_send(id)), 1
     FROM unnest($1::uuid[]) AS input(id) ON CONFLICT (id) DO NOTHING`,
    [intakeIds],
  )
  await query(
    `/* seedCopyrightUnlinkedEmailRetentionStorage */
     INSERT INTO copyright_notice_storage_objects (id, storage_key)
     SELECT id, 'explain-unlinked-' || id
     FROM unnest($1::uuid[]) AS input(id) ON CONFLICT (id) DO NOTHING`,
    [intakeIds],
  )
  await query(
    `/* seedCopyrightUnlinkedEmailRetentionIntakes */
     INSERT INTO copyright_notice_email_intakes
       (id, amazon_ses_message_id, received_at, raw_storage_object_id, raw_sha256, raw_media_type_id,
        raw_byte_size, spf_verdict, dkim_verdict, dmarc_verdict, spam_verdict, virus_verdict)
     SELECT id, 'explain-unlinked-' || id, uuid_extract_timestamp(id), id, sha256(uuid_send(id)),
       (SELECT id FROM media_types ORDER BY id LIMIT 1), 1, 'pass', 'pass', 'pass', 'pass', 'pass'
     FROM unnest($1::uuid[]) AS input(id) ON CONFLICT (id) DO NOTHING`,
    [intakeIds],
  )
  await query(
    `/* seedCopyrightUnlinkedEmailRetentionAttachments */
     INSERT INTO ${attachmentRelation}
       (id, copyright_notice_email_intake_id, ordinal, media_type_id, byte_size, sha256)
     SELECT id, owner_id, (row_number() OVER (PARTITION BY owner_id ORDER BY id) - 1)::int,
       (SELECT id FROM media_types ORDER BY id LIMIT 1), 1, sha256(uuid_send(id))
     FROM unnest($1::uuid[], $2::uuid[]) AS input(id, owner_id)`,
    [attachmentIds, attachmentOwners],
  )
  await query.commit()
}

export async function cleanupCopyrightUnlinkedEmailRetention(): Promise<void> {
  await using query = await beginTransaction()
  await query(enableEmailChildDelete)
  await query(
    `/* cleanupCopyrightUnlinkedEmailRetention */ DELETE FROM ${attachmentRelation} WHERE id = ANY($1::uuid[])`,
    [attachmentIds],
  )
  await query.commit()
}
