import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import {
  copyrightEmailIntakePurpose,
  type CopyrightEmailIntake,
} from '../services/copyright-notices/email-intakes.mts'
import { recordCopyrightEmailParse } from '../services/copyright-notices/email-intake-parses.mts'
import { decryptCopyrightEmailReplyHeaders } from '../services/copyright-notices/email-thread-references.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { readCopyrightCaseLifecycleClock } from './copyright-lifecycle-clock.mts'
import { readCopyrightEmailAncestorIds } from './copyright-email-ancestor-edges.mts'
import { copyrightPromotionResult } from './copyright-email-promotion-outcomes.mts'

export async function readOwnedCopyrightIntake(intakeId: string) {
  const { rows } = await write<CopyrightEmailIntake>(sql`/* readOwnedCopyrightIntake */
    SELECT intake.*, object.storage_key AS raw_storage_key, media.mime_type AS raw_mime_type
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_storage_objects object ON object.id = intake.raw_storage_object_id
    JOIN media_types media ON media.id = intake.raw_media_type_id WHERE intake.id = ${intakeId}`)
  if (!rows[0]) throw new Error('Owned parse intake is missing')
  return rows[0]
}

async function parseState(intakeId: string, parentId: string) {
  const [
    { rows: parses },
    { rows: references },
    { rows: links },
    { rows: receipts },
    parent,
    clock,
    ancestors,
  ] = await Promise.all([
    write<{
      status: string
      session: string
      sender: string
      subject: string
      body: string
      message: string | null
      headers: string | null
    }>(sql`
      /* ownedParseState:parse */ SELECT parse.status, intake.amazon_ses_message_id AS session,
        parse.sender_email_ciphertext AS sender, parse.subject_ciphertext AS subject, parse.body_ciphertext AS body,
        parse.message_id_ciphertext AS message, parse.reply_references_ciphertext AS headers
      FROM copyright_notice_email_intake_parses parse JOIN copyright_notice_email_intakes intake
        ON intake.id = parse.copyright_notice_email_intake_id WHERE intake.id = ${intakeId}`),
    write<{ count: number; message: number; reply: number }>(sql`/* ownedParseState:references */
      SELECT count(*)::int AS count, count(*) FILTER (WHERE reference_kind = 'message_id')::int AS message,
        count(*) FILTER (WHERE reference_kind <> 'message_id')::int AS reply
      FROM copyright_notice_email_thread_references WHERE copyright_notice_email_intake_id = ${intakeId}`),
    write(
      sql`/* ownedParseState:links */ SELECT * FROM copyright_notice_email_intake_notice_links WHERE copyright_notice_email_intake_id = ${intakeId}`,
    ),
    write(
      sql`/* ownedParseState:receipt */ SELECT * FROM copyright_notice_email_intake_receipts WHERE id = ${intakeId}`,
    ),
    getCopyrightNoticePrivateAggregate(parentId),
    readCopyrightCaseLifecycleClock(parentId),
    readCopyrightEmailAncestorIds(intakeId),
  ])
  const row = parses[0]
  const purpose = row ? copyrightEmailIntakePurpose(row.session) : null
  return {
    parse:
      row && purpose
        ? {
            status: row.status,
            sender: decryptSecret(row.sender, purpose),
            subject: decryptSecret(row.subject, purpose),
            body: decryptSecret(row.body, purpose),
            message: row.message ? decryptSecret(row.message, purpose) : null,
            headers: decryptCopyrightEmailReplyHeaders(row.headers, purpose),
          }
        : null,
    references: references[0]!,
    links,
    receipts,
    parent,
    clock,
    ancestors,
  }
}

const parseAborts = ['40001', '40P01'].map(code => ({
  status: 'rejected',
  statusCode: 409,
  code: 'copyright_email_thread_changed',
  message: 'Copyright email thread changed; retry staff approval',
  causeCode: code,
}))

/** Immutable first parse and already committed graph remain exact on replay or native abort. */
export async function assertOwnedCopyrightParseReplay(
  intake: CopyrightEmailIntake,
  input: Parameters<typeof recordCopyrightEmailParse>[1],
  parentId: string,
  match: { noticeId: string; matchedIntakeId: string; matchedReference: string },
) {
  const before = await parseState(intake.id, parentId)
  const [result] = await Promise.allSettled([recordCopyrightEmailParse(intake, input)])
  expect([
    { outcome: { status: 'fulfilled', value: match }, state: before },
    ...parseAborts.map(outcome => ({ outcome, state: before })),
  ]).toContainEqual({
    outcome: copyrightPromotionResult(result!),
    state: await parseState(intake.id, parentId),
  })
}

/** The first parse commits before separately atomic facts/derivation; no spoof may acquire the parent. */
export async function assertOwnedCopyrightUnknownParse(
  intake: CopyrightEmailIntake,
  input: Extract<Parameters<typeof recordCopyrightEmailParse>[1], { status: 'succeeded' }>,
  parentId: string,
) {
  const before = await parseState(intake.id, parentId)
  expect(before.parse).toBeNull()
  const [result] = await Promise.allSettled([recordCopyrightEmailParse(intake, input)])
  const parsed = {
    ...before,
    parse: {
      status: 'succeeded',
      sender: input.fromEmail,
      subject: input.subject,
      body: input.bodyText,
      message: input.messageId,
      headers: { inReplyTo: input.inReplyTo ?? [], references: input.replyReferences },
    },
  }
  const facts = { ...parsed, references: { count: 2, message: 1, reply: 1 } }
  expect([
    { outcome: { status: 'fulfilled', value: null }, state: facts },
    ...parseAborts.flatMap(outcome => [
      { outcome, state: parsed },
      { outcome, state: facts },
    ]),
  ]).toContainEqual({
    outcome: copyrightPromotionResult(result!),
    state: await parseState(intake.id, parentId),
  })
}
