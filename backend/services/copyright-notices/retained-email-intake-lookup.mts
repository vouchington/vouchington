import { beginTransaction } from '@data-stores/psql'
import { decryptSecret, hashToken } from '@modules/token-secrets'
import {
  decodeScopedPreciseTimestampCursor,
  encodeScopedPreciseTimestampCursor,
} from '@modules/pagination'
import { assertNotSuspended } from '@services/users/suspension-guard'
import type { PrivateUser } from '@services/users/types'
import { isEmailAddress } from '@ts-shared/utils/validation-core'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import { liveCopyrightCiphertext } from './erased-ciphertext.mts'
import { COPYRIGHT_ERASED_KEY_PREFIX } from './retention-erasure-spec.mts'

/** One bounded scan page, independent of staff decisions and delivery states. */
export async function lookupRetainedCopyrightEmailIntakes(
  currentUser: PrivateUser,
  options: { senderAddress: string; limit: number; after?: string; intakeIds?: readonly string[] },
) {
  assertNotSuspended(currentUser)
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  const senderAddress = options.senderAddress.trim().toLowerCase()
  assert(
    senderAddress.length <= 254 && isEmailAddress(senderAddress),
    422,
    'Invalid sender address',
  )
  assert(
    Number.isInteger(options.limit) && options.limit >= 1 && options.limit <= 100,
    422,
    'Invalid limit',
  )
  const cursorScope = `copyright-email-intakes:retained-lookup:${hashToken('copyright-retained-intake-lookup', senderAddress)}`
  const after = options.after
    ? decodeScopedPreciseTimestampCursor(
        options.after,
        cursorScope,
        'Invalid retained intake cursor',
      )
    : undefined
  const query = sql`/* lookupRetainedCopyrightEmailIntakes */
    SELECT intake.id, intake.amazon_ses_message_id, intake.raw_storage_key,
      parse.sender_email_ciphertext, link.copyright_notice_id AS linked_notice_id,
      to_char(intake.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_received_at
    FROM copyright_notice_email_intakes intake
    LEFT JOIN copyright_notice_email_intake_parses parse
      ON parse.copyright_notice_email_intake_id = intake.id
    LEFT JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = intake.id
    WHERE true`
  if (options.intakeIds) query.append(sql` AND intake.id = ANY(${[...options.intakeIds]}::uuid[])`)
  if (after)
    query.append(
      sql` AND (intake.received_at, intake.id) > (${after.timestamp}::timestamptz, ${after.id})`,
    )
  query.append(sql` ORDER BY intake.received_at, intake.id LIMIT ${options.limit + 1}`)
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    id: string
    amazon_ses_message_id: string
    raw_storage_key: string
    sender_email_ciphertext: string | null
    linked_notice_id: string | null
    cursor_received_at: string
  }>(query)
  await transaction.commit()
  const page = rows.slice(0, options.limit)
  const matches: Array<{ id: string; linked_notice_id: string | null }> = []
  const rawReviewCandidates: Array<{ id: string; linked_notice_id: string | null }> = []
  for (const intake of page) {
    const ciphertext = liveCopyrightCiphertext(intake.sender_email_ciphertext)
    const reference = { id: intake.id, linked_notice_id: intake.linked_notice_id }
    if (ciphertext === null) {
      // These are candidates, never matches: staff must inspect the retained MIME's From header.
      if (!intake.raw_storage_key.startsWith(COPYRIGHT_ERASED_KEY_PREFIX))
        rawReviewCandidates.push(reference)
      continue
    }
    const sender = decryptSecret(
      ciphertext,
      copyrightEmailIntakePurpose(intake.amazon_ses_message_id),
    )
    if (sender.trim().toLowerCase() === senderAddress) matches.push(reference)
  }
  const last = page.at(-1)
  return {
    matches,
    raw_review_candidates: rawReviewCandidates,
    scanned_count: page.length,
    // Advance through scanned rows, even when a page contains no address matches.
    next_cursor:
      rows.length > options.limit && last
        ? encodeScopedPreciseTimestampCursor(last.cursor_received_at, last.id, cursorScope)
        : null,
  }
}
