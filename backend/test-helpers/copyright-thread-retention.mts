import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type Token = { id: string; lookup_digest: string }

export async function readCopyrightThreadTokenForIntake(
  intakeId: string,
  kind: 'message_id' | 'matched',
): Promise<Token | null> {
  const statement =
    kind === 'matched'
      ? sql`/* readCopyrightThreadTokenForIntake:matched */
          SELECT token.id, token.lookup_digest
          FROM copyright_notice_email_intake_notice_links link
          JOIN copyright_notice_email_thread_tokens token ON token.id = link.matched_token_id
          WHERE link.copyright_notice_email_intake_id = ${intakeId}`
      : sql`/* readCopyrightThreadTokenForIntake:message */
          SELECT token.id, token.lookup_digest
          FROM copyright_notice_email_thread_references reference
          JOIN copyright_notice_email_thread_tokens token ON token.id = reference.token_id
          WHERE reference.copyright_notice_email_intake_id = ${intakeId}
            AND reference.reference_kind = 'message_id'`
  const { rows } = await read<Token>(statement)
  return rows[0] ?? null
}

export async function readCopyrightThreadTokenById(tokenId: string): Promise<Token | null> {
  const { rows } = await read<Token>(sql`/* readCopyrightThreadTokenById */
    SELECT id, lookup_digest FROM copyright_notice_email_thread_tokens WHERE id = ${tokenId}`)
  return rows[0] ?? null
}

export async function insertCopyrightThreadReferenceWithoutToken(intakeId: string): Promise<void> {
  await write(sql`/* insertCopyrightThreadReferenceWithoutToken */
    INSERT INTO copyright_notice_email_thread_references (
      copyright_notice_email_intake_id, token_id, reference_kind
    ) VALUES (${intakeId}, NULL, 'message_id')`)
}
