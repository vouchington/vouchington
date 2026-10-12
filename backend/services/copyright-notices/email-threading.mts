import { beginTransaction } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { findOutboundCopyrightEmailThreadMatch } from './email-threading-outbound.mts'

export type CopyrightEmailThreadMatch = {
  noticeId: string
  matchedIntakeId: string | null
  matchedReference: string
}

const THREAD_REFERENCE_PURPOSE = 'copyright-email-thread-reference'

export async function recordCopyrightEmailThreadReferences(input: {
  intakeId: string
  messageId: string | null
  replyReferences: string[]
}): Promise<CopyrightEmailThreadMatch | null> {
  const references = [
    ...(input.messageId
      ? [
          {
            value: normalizeReference(input.messageId),
            kind: 'message_id' as const,
          },
        ]
      : []),
    ...input.replyReferences.map(value => ({
      value: normalizeReference(value),
      kind: 'reply_reference' as const,
    })),
  ].filter(reference => reference.value.length > 0)
  const referenceRows = references.map(reference => ({
    lookup_token: hashToken(THREAD_REFERENCE_PURPOSE, reference.value),
    reference_kind: reference.kind,
  }))
  await using transaction = await beginTransaction()
  if (referenceRows.length > 0) {
    // Both arrival orders serialize on the same private token before either reads for an edge.
    for (const lookupToken of [...new Set(referenceRows.map(row => row.lookup_token))].toSorted()) {
      // oxlint-disable-next-line no-await-in-loop -- deterministic advisory-lock order prevents crossed replies from deadlocking
      await transaction(sql`/* recordCopyrightEmailThreadReferences:lock */
        SELECT pg_advisory_xact_lock(hashtextextended(${lookupToken}, 0))
      `)
    }
    const rows = JSON.stringify(referenceRows)
    await transaction(sql`/* recordCopyrightEmailThreadReferences */
      INSERT INTO copyright_notice_email_thread_references (
        copyright_notice_email_intake_id, lookup_token, reference_kind
      ) SELECT ${input.intakeId}::uuid AS intake_id, reference.lookup_token, reference.reference_kind
      FROM jsonb_to_recordset(${rows}::jsonb) AS reference(
        lookup_token text, reference_kind copyright_notice_email_thread_reference_kinds
      )
      ORDER BY intake_id, reference.lookup_token, reference.reference_kind
      ON CONFLICT (copyright_notice_email_intake_id, lookup_token, reference_kind) DO NOTHING
    `)
    const replyLookups = referenceRows.reduce<string[]>((tokens, reference) => {
      if (reference.reference_kind === 'reply_reference') tokens.push(reference.lookup_token)
      return tokens
    }, [])
    if (replyLookups.length > 0) {
      await transaction(sql`/* recordCopyrightEmailThreadReferences:parent */
        INSERT INTO copyright_notice_email_message_parents (reply_message_intake_id, parent_message_intake_id)
        SELECT ${input.intakeId}::uuid, parent.copyright_notice_email_intake_id
        FROM copyright_notice_email_thread_references parent
        WHERE parent.lookup_token = ANY(${replyLookups}::text[])
          AND parent.reference_kind = 'message_id'
          AND parent.copyright_notice_email_intake_id <> ${input.intakeId}
        ORDER BY array_position(${replyLookups}::text[], parent.lookup_token),
          parent.copyright_notice_email_intake_id
        LIMIT 1
        ON CONFLICT (reply_message_intake_id) DO NOTHING
      `)
    }
    const messageLookup = referenceRows.find(
      row => row.reference_kind === 'message_id',
    )?.lookup_token
    if (messageLookup) {
      await transaction(sql`/* recordCopyrightEmailThreadReferences:waitingReplies */
        INSERT INTO copyright_notice_email_message_parents (reply_message_intake_id, parent_message_intake_id)
        SELECT DISTINCT reference.copyright_notice_email_intake_id, ${input.intakeId}::uuid
        FROM copyright_notice_email_thread_references reference
        WHERE reference.lookup_token = ${messageLookup}
          AND reference.reference_kind = 'reply_reference'
          AND reference.copyright_notice_email_intake_id <> ${input.intakeId}
        ORDER BY reference.copyright_notice_email_intake_id
        ON CONFLICT (reply_message_intake_id) DO NOTHING
      `)
    }
  }
  await transaction.commit()
  const replyReferences = references.reduce<string[]>((result, reference) => {
    if (reference.kind === 'reply_reference') result.push(reference.value)
    return result
  }, [])
  const match = await findCopyrightEmailThreadMatch(input.intakeId, replyReferences)
  if (match) {
    await linkCopyrightEmailIntakeToNotice({
      intakeId: input.intakeId,
      noticeId: match.noticeId,
      linkKind: 'thread',
      matchedReference: match.matchedReference,
    })
  }
  return match
}

export async function linkCopyrightEmailIntakeToNotice(input: {
  intakeId: string
  noticeId: string
  linkKind: 'initial' | 'thread'
  matchedReference?: string | null
}): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* linkCopyrightEmailIntakeToNotice */
    INSERT INTO copyright_notice_email_intake_notice_links (
      copyright_notice_email_intake_id, copyright_notice_id, link_kind,
      matched_reference_lookup
    ) VALUES (
      ${input.intakeId}, ${input.noticeId}, ${input.linkKind},
      ${input.matchedReference ? hashToken(THREAD_REFERENCE_PURPOSE, input.matchedReference) : null}
    ) ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
  `)
  if (input.linkKind === 'thread') {
    await transaction(sql`/* linkCopyrightEmailIntakeToNotice:pendingReview */
      INSERT INTO copyright_notice_email_correspondence_reviews (
        copyright_notice_email_intake_id, copyright_notice_id, action
      ) VALUES (${input.intakeId}, ${input.noticeId}, 'pending')
      ON CONFLICT (copyright_notice_email_intake_id, action) DO NOTHING
    `)
  }
  await transaction.commit()
}

async function findCopyrightEmailThreadMatch(
  intakeId: string,
  references: string[],
): Promise<CopyrightEmailThreadMatch | null> {
  if (references.length === 0) return null
  const [inbound, outbound] = await Promise.all([
    findInboundCopyrightEmailThreadMatch(intakeId, references),
    findOutboundCopyrightEmailThreadMatch(references),
  ])
  const matches = [inbound, outbound].filter(
    (match): match is CopyrightEmailThreadMatch => match !== null,
  )
  const noticeIds = new Set(matches.map(match => match.noticeId))
  if (noticeIds.size !== 1) return null
  return inbound ?? outbound
}

async function findInboundCopyrightEmailThreadMatch(
  intakeId: string,
  references: string[],
): Promise<CopyrightEmailThreadMatch | null> {
  const lookups = references.map(reference => hashToken(THREAD_REFERENCE_PURPOSE, reference))
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    noticeId: string
    matchedIntakeId: string
    matchedLookup: string
  }>(sql`/* findCopyrightEmailThreadMatch */
    SELECT link.copyright_notice_id AS "noticeId",
      (array_agg(reference.copyright_notice_email_intake_id ORDER BY reference.copyright_notice_email_intake_id))[1] AS "matchedIntakeId",
      min(reference.lookup_token) AS "matchedLookup"
    FROM copyright_notice_email_thread_references reference
    JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = reference.copyright_notice_email_intake_id
    WHERE reference.lookup_token = ANY(${lookups})
      AND reference.copyright_notice_email_intake_id <> ${intakeId}
    GROUP BY link.copyright_notice_id
    ORDER BY link.copyright_notice_id
    LIMIT 2
  `)
  await transaction.commit()
  if (rows.length !== 1) return null
  const row = rows[0]
  if (!row?.matchedLookup) return null
  const matchedReference = references.find(
    reference => hashToken(THREAD_REFERENCE_PURPOSE, reference) === row.matchedLookup,
  )
  assert(matchedReference, 500, 'Copyright email thread match has no reference')
  return { ...row, matchedReference }
}

function normalizeReference(reference: string): string {
  const normalized = reference.trim().replace(/\s+/g, ' ')
  return normalized.startsWith('<') && normalized.endsWith('>')
    ? normalized.slice(1, -1).trim()
    : normalized
}
