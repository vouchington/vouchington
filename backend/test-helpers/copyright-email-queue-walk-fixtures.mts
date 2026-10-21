import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { version } from 'uuid'
import { recordCopyrightEmailParse } from '../services/copyright-notices/index.mts'
import { createParsedCopyrightEmailIntake } from './copyright-email-intake-fixtures.mts'

/** Adjacent owned IDs keep each actual HTTP continuation inside this timestamp's fixtures. */
export async function createCopyrightEmailQueueWalkFixtures() {
  const seed = await createParsedCopyrightEmailIntake()
  const ids = [seed.id, nextId(seed.id, 1n), nextId(seed.id, 2n)]
  const messageIds = ids.slice(1).map(() => `ses-walk-${crypto.randomUUID()}`)
  const { rows } = await write<{ id: string; amazon_ses_message_id: string }>(sql`
    /* createCopyrightEmailQueueWalkFixtures */
    INSERT INTO copyright_notice_email_intakes (
      id, amazon_ses_message_id, received_at, raw_storage_object_id, raw_sha256,
      raw_media_type_id, raw_byte_size, spf_verdict, dkim_verdict, dmarc_verdict,
      spam_verdict, virus_verdict
    )
    SELECT owned.id, owned.message_id, seed.received_at, seed.raw_storage_object_id,
      seed.raw_sha256, seed.raw_media_type_id, seed.raw_byte_size, seed.spf_verdict,
      seed.dkim_verdict, seed.dmarc_verdict, seed.spam_verdict, seed.virus_verdict
    FROM copyright_notice_email_intakes seed
    CROSS JOIN unnest(${ids.slice(1)}::uuid[], ${messageIds}::text[]) AS owned(id, message_id)
    WHERE seed.id = ${seed.id}
    RETURNING id, amazon_ses_message_id
  `)
  if (rows.length !== 2) throw new Error('Missing owned copyright intake seed')
  for (const row of rows) {
    await recordCopyrightEmailParse(
      { ...seed, ...row },
      {
        status: 'succeeded',
        fromEmail: `claimant-${crypto.randomUUID()}@example.test`,
        subject: 'Copyright complaint',
        bodyText: 'This is a copyright complaint.',
        messageId: `<${crypto.randomUUID()}@example.test>`,
        replyReferences: [],
        attachments: [],
      },
    )
  }
  return { ids, receivedAt: seed.received_at }
}

function nextId(id: string, offset: bigint): string {
  const hex = (BigInt(`0x${id.replaceAll('-', '')}`) + offset).toString(16).padStart(32, '0')
  const next = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
  if (version(next) !== 7) throw new Error('Copyright fixture UUID window overflow')
  return next
}
