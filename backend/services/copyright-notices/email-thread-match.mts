import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { findOutboundCopyrightEmailThreadMatch } from './email-threading-outbound.mts'
import { copyrightEmailReferencedTokenIsAmbiguousSql } from './email-thread-review-path.mts'
import { COPYRIGHT_EMAIL_THREAD_REFERENCE_PURPOSE } from './email-thread-references.mts'

export type CopyrightEmailThreadMatch = {
  noticeId: string
  matchedIntakeId: string | null
  matchedReference: string
}

type InboundAncestorMatch = {
  status: 'none' | 'blocked' | 'match'
  noticeId: string | null
  matchedIntakeId: string | null
  matchedTokenId: string | null
}

type InboundAncestorRow = {
  ancestorCount: number
  noticeCount: number
  unlinkedCount: number
  noticeId: string | null
  matchedIntakeId: string | null
  matchedTokenId: string | null
  referencedAmbiguous: boolean
}

/**
 * One notice across ancestor edges and a sent outbound message. A known unlinked ancestor,
 * two cases, or a duplicated referenced Message-ID matches nothing, so outbound cannot claim it.
 */
export async function findCopyrightEmailThreadMatch(
  intakeId: string,
  references: string[],
  tokenIds: ReadonlyMap<string, string>,
  transaction?: TransactionQuery,
): Promise<CopyrightEmailThreadMatch | null> {
  if (references.length === 0) return null
  if (transaction) return matchCopyrightEmailThread(intakeId, references, tokenIds, transaction)
  await using owned = await beginTransaction()
  const match = await matchCopyrightEmailThread(intakeId, references, tokenIds, owned)
  await owned.commit()
  return match
}

async function matchCopyrightEmailThread(
  intakeId: string,
  references: string[],
  tokenIds: ReadonlyMap<string, string>,
  transaction: TransactionQuery,
): Promise<CopyrightEmailThreadMatch | null> {
  const inbound = await findInboundCopyrightEmailThreadMatch(
    intakeId,
    [...tokenIds.values()],
    transaction,
  )
  if (inbound.status === 'blocked') return null
  const outbound = await findOutboundCopyrightEmailThreadMatch(references, transaction)
  const inboundMatch =
    inbound.status === 'match' ? toInboundMatch(inbound, references, tokenIds) : null
  const matches = [inboundMatch, outbound].filter(
    (match): match is CopyrightEmailThreadMatch => match !== null,
  )
  const noticeIds = new Set(matches.map(match => match.noticeId))
  if (noticeIds.size !== 1) return null
  return inboundMatch ?? outbound
}

async function findInboundCopyrightEmailThreadMatch(
  intakeId: string,
  tokenIds: string[],
  transaction: TransactionQuery,
): Promise<InboundAncestorMatch> {
  const matchQuery = sql`/* findCopyrightEmailThreadMatch */
    WITH RECURSIVE ancestors(intake_id) AS (
      SELECT ancestor.ancestor_message_intake_id
      FROM copyright_notice_email_message_ancestors ancestor
      WHERE ancestor.reply_message_intake_id = ${intakeId}
      UNION
      SELECT edge.ancestor_message_intake_id
      FROM ancestors parent
      JOIN copyright_notice_email_message_ancestors edge
        ON edge.reply_message_intake_id = parent.intake_id
    )
    SELECT (SELECT count(*)::int FROM ancestors) AS "ancestorCount",
      (
        SELECT count(DISTINCT link.copyright_notice_id)::int
        FROM ancestors
        JOIN copyright_notice_email_intake_notice_links link
          ON link.copyright_notice_email_intake_id = ancestors.intake_id
      ) AS "noticeCount",
      (
        SELECT count(*)::int FROM ancestors
        WHERE NOT EXISTS (
          SELECT 1 FROM copyright_notice_email_intake_notice_links link
          WHERE link.copyright_notice_email_intake_id = ancestors.intake_id
        )
      ) AS "unlinkedCount",
      (
        SELECT min(link.copyright_notice_id::text)::uuid
        FROM ancestors
        JOIN copyright_notice_email_intake_notice_links link
          ON link.copyright_notice_email_intake_id = ancestors.intake_id
      ) AS "noticeId",
      (
        SELECT min(direct_edge.ancestor_message_intake_id::text)::uuid
        FROM copyright_notice_email_message_ancestors direct_edge
        JOIN copyright_notice_email_thread_references parent_message
          ON parent_message.copyright_notice_email_intake_id = direct_edge.ancestor_message_intake_id
         AND parent_message.reference_kind = 'message_id'
         AND parent_message.token_id = ANY(${tokenIds}::uuid[])
        WHERE direct_edge.reply_message_intake_id = ${intakeId}
      ) AS "matchedIntakeId",
      (
        SELECT min(parent_message.token_id::text)::uuid
        FROM copyright_notice_email_message_ancestors direct_edge
        JOIN copyright_notice_email_thread_references parent_message
          ON parent_message.copyright_notice_email_intake_id = direct_edge.ancestor_message_intake_id
         AND parent_message.reference_kind = 'message_id'
         AND parent_message.token_id = ANY(${tokenIds}::uuid[])
        WHERE direct_edge.reply_message_intake_id = ${intakeId}
      ) AS "matchedTokenId",
      `
  matchQuery.append(copyrightEmailReferencedTokenIsAmbiguousSql(sql`${intakeId}`))
  matchQuery.append(sql` AS "referencedAmbiguous"`)
  const { rows } = await transaction<InboundAncestorRow>(matchQuery)
  return toInboundAncestorMatch(rows[0])
}

function toInboundAncestorMatch(row: InboundAncestorRow | undefined): InboundAncestorMatch {
  assert(row, 500, 'Copyright email thread match returned no row')
  if (row.referencedAmbiguous || row.unlinkedCount > 0 || row.noticeCount !== 1) {
    return {
      status: row.ancestorCount === 0 && !row.referencedAmbiguous ? 'none' : 'blocked',
      noticeId: null,
      matchedIntakeId: null,
      matchedTokenId: null,
    }
  }
  assert(row.noticeId, 500, 'Copyright email thread match has no notice')
  return {
    status: 'match',
    noticeId: row.noticeId,
    matchedIntakeId: row.matchedIntakeId,
    matchedTokenId: row.matchedTokenId,
  }
}

function toInboundMatch(
  inbound: InboundAncestorMatch,
  references: string[],
  tokenIds: ReadonlyMap<string, string>,
): CopyrightEmailThreadMatch | null {
  if (!inbound.noticeId || !inbound.matchedTokenId) return null
  const matchedReference = references.find(
    reference =>
      tokenIds.get(hashToken(COPYRIGHT_EMAIL_THREAD_REFERENCE_PURPOSE, reference)) ===
      inbound.matchedTokenId,
  )
  assert(matchedReference, 500, 'Copyright email thread match has no reference')
  return {
    noticeId: inbound.noticeId,
    matchedIntakeId: inbound.matchedIntakeId,
    matchedReference,
  }
}
