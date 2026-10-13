import { beginTransaction } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { findOutboundCopyrightEmailThreadMatch } from './email-threading-outbound.mts'
import { copyrightEmailIntakeMessageIdIsAmbiguousSql } from './email-thread-review-path.mts'
import { COPYRIGHT_EMAIL_THREAD_REFERENCE_PURPOSE } from './email-thread-references.mts'

export type CopyrightEmailThreadMatch = {
  noticeId: string
  matchedIntakeId: string | null
  matchedReference: string
}

type InboundAncestorMatch = {
  status: 'none' | 'conflict' | 'match'
  noticeId: string | null
  matchedIntakeId: string | null
  matchedLookup: string | null
}

/** One notice across ancestor edges and a sent outbound message. Conflicting ancestors match nothing. */
export async function findCopyrightEmailThreadMatch(
  intakeId: string,
  references: string[],
): Promise<CopyrightEmailThreadMatch | null> {
  if (references.length === 0) return null
  const [inbound, outbound] = await Promise.all([
    findInboundCopyrightEmailThreadMatch(intakeId, references),
    findOutboundCopyrightEmailThreadMatch(references),
  ])
  if (inbound.status === 'conflict') return null
  const inboundMatch = inbound.status === 'match' ? toInboundMatch(inbound, references) : null
  const matches = [inboundMatch, outbound].filter(
    (match): match is CopyrightEmailThreadMatch => match !== null,
  )
  const noticeIds = new Set(matches.map(match => match.noticeId))
  if (noticeIds.size !== 1) return null
  return inboundMatch ?? outbound
}

async function findInboundCopyrightEmailThreadMatch(
  intakeId: string,
  references: string[],
): Promise<InboundAncestorMatch> {
  const lookups = references.map(reference =>
    hashToken(COPYRIGHT_EMAIL_THREAD_REFERENCE_PURPOSE, reference),
  )
  const matchQuery = sql`/* findCopyrightEmailThreadMatch */
    WITH RECURSIVE ancestors(intake_id) AS (
      SELECT ancestor.ancestor_message_intake_id
      FROM copyright_notice_email_message_ancestors ancestor
      WHERE ancestor.reply_message_intake_id = ${intakeId}
        AND NOT `
  matchQuery.append(
    copyrightEmailIntakeMessageIdIsAmbiguousSql(sql`ancestor.ancestor_message_intake_id`),
  )
  matchQuery.append(sql`
      UNION
      SELECT edge.ancestor_message_intake_id
      FROM ancestors parent
      JOIN copyright_notice_email_message_ancestors edge
        ON edge.reply_message_intake_id = parent.intake_id
      WHERE NOT `)
  matchQuery.append(
    copyrightEmailIntakeMessageIdIsAmbiguousSql(sql`edge.ancestor_message_intake_id`),
  )
  matchQuery.append(sql`
    )
    SELECT link.copyright_notice_id AS "noticeId",
      (
        SELECT min(direct_edge.ancestor_message_intake_id::text)::uuid
        FROM copyright_notice_email_message_ancestors direct_edge
        JOIN copyright_notice_email_thread_references parent_message
          ON parent_message.copyright_notice_email_intake_id = direct_edge.ancestor_message_intake_id
         AND parent_message.reference_kind = 'message_id'
         AND parent_message.lookup_token = ANY(${lookups})
        WHERE direct_edge.reply_message_intake_id = ${intakeId}
          AND NOT `)
  matchQuery.append(
    copyrightEmailIntakeMessageIdIsAmbiguousSql(sql`direct_edge.ancestor_message_intake_id`),
  )
  matchQuery.append(sql`
      ) AS "matchedIntakeId",
      (
        SELECT min(parent_message.lookup_token)
        FROM copyright_notice_email_message_ancestors direct_edge
        JOIN copyright_notice_email_thread_references parent_message
          ON parent_message.copyright_notice_email_intake_id = direct_edge.ancestor_message_intake_id
         AND parent_message.reference_kind = 'message_id'
         AND parent_message.lookup_token = ANY(${lookups})
        WHERE direct_edge.reply_message_intake_id = ${intakeId}
          AND NOT `)
  matchQuery.append(
    copyrightEmailIntakeMessageIdIsAmbiguousSql(sql`direct_edge.ancestor_message_intake_id`),
  )
  matchQuery.append(sql`
      ) AS "matchedLookup"
    FROM ancestors
    LEFT JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = ancestors.intake_id
    GROUP BY link.copyright_notice_id
    ORDER BY link.copyright_notice_id
    LIMIT 2
  `)
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    noticeId: string | null
    matchedIntakeId: string | null
    matchedLookup: string | null
  }>(matchQuery)
  await transaction.commit()
  if (rows.length > 1)
    return { status: 'conflict', noticeId: null, matchedIntakeId: null, matchedLookup: null }
  const row = rows[0]
  if (!row?.noticeId)
    return { status: 'none', noticeId: null, matchedIntakeId: null, matchedLookup: null }
  return { status: 'match', ...row }
}

function toInboundMatch(
  inbound: InboundAncestorMatch,
  references: string[],
): CopyrightEmailThreadMatch | null {
  if (!inbound.noticeId || !inbound.matchedLookup) return null
  const matchedReference = references.find(
    reference =>
      hashToken(COPYRIGHT_EMAIL_THREAD_REFERENCE_PURPOSE, reference) === inbound.matchedLookup,
  )
  assert(matchedReference, 500, 'Copyright email thread match has no reference')
  return {
    noticeId: inbound.noticeId,
    matchedIntakeId: inbound.matchedIntakeId,
    matchedReference,
  }
}
