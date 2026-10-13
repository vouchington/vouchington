import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql, { type SQLStatement } from 'sql-template-strings'

export type CopyrightEmailReviewPath =
  | 'matched_thread'
  | 'duplicate_message_id'
  | 'ancestor_notice_conflict'
  | 'unresolved_thread'
  | 'initial'

/**
 * Precedence is linked thread, then a duplicated Message-ID, then ancestors on different
 * cases, then a reply that is still waiting, then a new email. The two computed reasons
 * apply only while the intake has no notice link.
 */
export function copyrightEmailReviewPath(row: {
  link_kind: 'initial' | 'thread' | null
  has_duplicate_message_id: boolean
  has_ancestor_notice_conflict: boolean
  has_reply_reference: boolean
}): CopyrightEmailReviewPath {
  if (row.link_kind === 'thread') return 'matched_thread'
  if (row.link_kind === null && row.has_duplicate_message_id) return 'duplicate_message_id'
  if (row.link_kind === null && row.has_ancestor_notice_conflict) return 'ancestor_notice_conflict'
  if (row.has_reply_reference) return 'unresolved_thread'
  return 'initial'
}

/** Correlated to the outer `intake` row. One token lookup, not a scan of every reference. */
export function copyrightEmailDuplicateMessageIdSql(): SQLStatement {
  return sql`EXISTS (
    SELECT 1 FROM copyright_notice_email_thread_references own_reference
    WHERE own_reference.copyright_notice_email_intake_id = intake.id
      AND own_reference.reference_kind IN ('message_id', 'in_reply_to', 'references')
      AND EXISTS (
        SELECT 1
        FROM copyright_notice_email_thread_references first_claimant
        JOIN copyright_notice_email_thread_references second_claimant
          ON second_claimant.lookup_token = first_claimant.lookup_token
         AND second_claimant.reference_kind = 'message_id'
         AND second_claimant.copyright_notice_email_intake_id <> first_claimant.copyright_notice_email_intake_id
        WHERE first_claimant.lookup_token = own_reference.lookup_token
          AND first_claimant.reference_kind = 'message_id'
      )
  )`
}

/** Correlated ancestor walk for the outer `intake` row. Unlinked ancestors add no notice. */
export function copyrightEmailAncestorNoticeConflictSql(): SQLStatement {
  return sql`(
    WITH RECURSIVE reached(intake_id) AS (
      SELECT ancestor.ancestor_message_intake_id
      FROM copyright_notice_email_message_ancestors ancestor
      WHERE ancestor.reply_message_intake_id = intake.id
      UNION
      SELECT next_edge.ancestor_message_intake_id
      FROM reached reached_intake
      JOIN copyright_notice_email_message_ancestors next_edge
        ON next_edge.reply_message_intake_id = reached_intake.intake_id
    )
    SELECT count(DISTINCT link.copyright_notice_id) > 1
    FROM reached
    JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = reached.intake_id
  )`
}

export function copyrightEmailReplyReferenceSql(): SQLStatement {
  return sql`EXISTS (
    SELECT 1 FROM copyright_notice_email_thread_references reference
    WHERE reference.copyright_notice_email_intake_id = intake.id
      AND reference.reference_kind IN ('in_reply_to', 'references')
  )`
}

/** True when `intakeId` already has another intake claiming the same Message-ID. */
export function copyrightEmailIntakeMessageIdIsAmbiguousSql(intakeId: SQLStatement): SQLStatement {
  const query = sql`EXISTS (
    SELECT 1
    FROM copyright_notice_email_thread_references claimed
    JOIN copyright_notice_email_thread_references other_claim
      ON other_claim.lookup_token = claimed.lookup_token
     AND other_claim.reference_kind = 'message_id'
     AND other_claim.copyright_notice_email_intake_id <> claimed.copyright_notice_email_intake_id
    WHERE claimed.reference_kind = 'message_id'
      AND claimed.copyright_notice_email_intake_id = `
  query.append(intakeId)
  query.append(sql`)`)
  return query
}

/** True when one In-Reply-To or References token is a Message-ID claimed by two or more intakes. */
export function copyrightEmailReferencedTokenIsAmbiguousSql(intakeId: SQLStatement): SQLStatement {
  const query = sql`EXISTS (
    SELECT 1
    FROM copyright_notice_email_thread_references reference
    JOIN copyright_notice_email_thread_references first_claimant
      ON first_claimant.lookup_token = reference.lookup_token
     AND first_claimant.reference_kind = 'message_id'
    JOIN copyright_notice_email_thread_references second_claimant
      ON second_claimant.lookup_token = reference.lookup_token
     AND second_claimant.reference_kind = 'message_id'
     AND second_claimant.copyright_notice_email_intake_id <> first_claimant.copyright_notice_email_intake_id
    WHERE reference.reference_kind IN ('in_reply_to', 'references')
      AND reference.copyright_notice_email_intake_id = `
  query.append(intakeId)
  query.append(sql`)`)
  return query
}

/** A reply still waiting for one root case. Duplicate and conflicting intakes are reviewable. */
export async function assertCopyrightEmailUnresolvedReply(
  transaction: TransactionQuery,
  intakeId: string,
): Promise<void> {
  const query = sql`/* assertCopyrightEmailUnresolvedReply */
    SELECT 1 FROM copyright_notice_email_intakes intake
    WHERE intake.id = ${intakeId}
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_email_intake_notice_links link
        WHERE link.copyright_notice_email_intake_id = intake.id AND link.link_kind = 'thread'
      )
      AND `
  query.append(copyrightEmailReplyReferenceSql())
  query.append(sql` AND NOT `)
  query.append(copyrightEmailDuplicateMessageIdSql())
  query.append(sql` AND NOT `)
  query.append(copyrightEmailAncestorNoticeConflictSql())
  query.append(sql` LIMIT 1`)
  const { rows } = await transaction(query)
  assert(!rows[0], 409, 'Unresolved reply email must wait for its root case')
}
