import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export type AutotaggerReceiptSubject =
  | { postId: string; rssFeedItemId: null }
  | { postId: null; rssFeedItemId: string }

export type ClaimAutotaggerReceiptInput = {
  subject: AutotaggerReceiptSubject
  digestVersion: number
  digest: Buffer
  leaseSeconds: number
}

export type ClaimAutotaggerReceiptResult =
  | {
      kind: 'claimed'
      receiptId: string
      batchId: string
      leaseToken: string
      attemptNumber: number
    }
  | { kind: 'in_progress'; retryAfterSeconds: number }
  | { kind: 'completed'; receiptId: string; batchId: string }

type ExistingReceiptRow = {
  id: string
  batch_id: string
  completed_at: Date | null
  lease_is_live: boolean
  retry_after_seconds: number | null
  attempt_count: string
}

/**
 * Atomically claims the exclusive right to dispatch a C6 tagging-classifier
 * decision for one (subject, digest_version, digest) identity. A brand-new
 * identity is created and claimed in the same insert. An existing identity
 * that is already terminally completed is reported as `completed` (with its
 * `batchId`) so the caller can still apply idempotent vote application
 * without re-dispatching. A live, unexpired lease is reported as
 * `in_progress`. An expired lease is reclaimed: the stale attempt is closed
 * out with outcome `expired` and a fresh attempt begins under a new lease
 * token, fencing the previous claimant out of completion.
 */
export async function claimAutotaggerReceipt(
  input: ClaimAutotaggerReceiptInput,
): Promise<ClaimAutotaggerReceiptResult> {
  const leaseToken = randomUUID()
  const batchId = uuidv7()
  await using query = await beginTransaction()

  const inserted = await query<{ id: string; batch_id: string }>(
    input.subject.postId !== null
      ? sql`/* claimAutotaggerReceipt.insertPost */
          INSERT INTO autotagger_receipts
            (post_id, digest_version, digest, batch_id, lease_token, leased_at, lease_expires_at)
          VALUES (
            ${input.subject.postId}, ${input.digestVersion}, ${input.digest}, ${batchId},
            ${leaseToken}, clock_timestamp(), clock_timestamp() + ${input.leaseSeconds} * INTERVAL '1 second'
          )
          ON CONFLICT (post_id, digest_version, digest) WHERE post_id IS NOT NULL DO NOTHING
          RETURNING id, batch_id`
      : sql`/* claimAutotaggerReceipt.insertRssFeedItem */
          INSERT INTO autotagger_receipts
            (rss_feed_item_id, digest_version, digest, batch_id, lease_token, leased_at, lease_expires_at)
          VALUES (
            ${input.subject.rssFeedItemId}, ${input.digestVersion}, ${input.digest}, ${batchId},
            ${leaseToken}, clock_timestamp(), clock_timestamp() + ${input.leaseSeconds} * INTERVAL '1 second'
          )
          ON CONFLICT (rss_feed_item_id, digest_version, digest) WHERE rss_feed_item_id IS NOT NULL DO NOTHING
          RETURNING id, batch_id`,
  )
  const created = inserted.rows[0]
  if (created) {
    await query(sql`/* claimAutotaggerReceipt.firstAttempt */
      INSERT INTO autotagger_receipt_attempts (receipt_id, attempt_number, lease_token)
      VALUES (${created.id}, 1, ${leaseToken})`)
    await query.commit()
    return {
      kind: 'claimed',
      receiptId: created.id,
      batchId: created.batch_id,
      leaseToken,
      attemptNumber: 1,
    }
  }

  const existingRows = await query<ExistingReceiptRow>(
    input.subject.postId !== null
      ? sql`/* claimAutotaggerReceipt.selectPost */
          SELECT r.id, r.batch_id, r.completed_at,
            (r.lease_token IS NOT NULL AND r.lease_expires_at > clock_timestamp()) AS lease_is_live,
            CASE WHEN r.lease_token IS NOT NULL AND r.lease_expires_at > clock_timestamp()
              THEN GREATEST(1, CEIL(EXTRACT(EPOCH FROM r.lease_expires_at - clock_timestamp())))::integer
              ELSE NULL END AS retry_after_seconds,
            (SELECT COUNT(*)::text FROM autotagger_receipt_attempts a WHERE a.receipt_id = r.id) AS attempt_count
          FROM autotagger_receipts r
          WHERE r.post_id = ${input.subject.postId} AND r.digest_version = ${input.digestVersion}
            AND r.digest = ${input.digest}
          FOR UPDATE`
      : sql`/* claimAutotaggerReceipt.selectRssFeedItem */
          SELECT r.id, r.batch_id, r.completed_at,
            (r.lease_token IS NOT NULL AND r.lease_expires_at > clock_timestamp()) AS lease_is_live,
            CASE WHEN r.lease_token IS NOT NULL AND r.lease_expires_at > clock_timestamp()
              THEN GREATEST(1, CEIL(EXTRACT(EPOCH FROM r.lease_expires_at - clock_timestamp())))::integer
              ELSE NULL END AS retry_after_seconds,
            (SELECT COUNT(*)::text FROM autotagger_receipt_attempts a WHERE a.receipt_id = r.id) AS attempt_count
          FROM autotagger_receipts r
          WHERE r.rss_feed_item_id = ${input.subject.rssFeedItemId} AND r.digest_version = ${input.digestVersion}
            AND r.digest = ${input.digest}
          FOR UPDATE`,
  )
  const existing = existingRows.rows[0]
  if (!existing) throw new Error('Autotagger receipt disappeared before claim could be resolved')

  if (existing.completed_at) {
    await query.commit()
    return { kind: 'completed', receiptId: existing.id, batchId: existing.batch_id }
  }
  if (existing.lease_is_live) {
    await query.commit()
    return { kind: 'in_progress', retryAfterSeconds: existing.retry_after_seconds ?? 1 }
  }

  await query(sql`/* claimAutotaggerReceipt.expireStaleAttempt */
    UPDATE autotagger_receipt_attempts
    SET failed_at = clock_timestamp(), outcome = 'expired'
    WHERE receipt_id = ${existing.id} AND completed_at IS NULL AND failed_at IS NULL`)
  const nextAttemptNumber = Number(existing.attempt_count) + 1
  await query(sql`/* claimAutotaggerReceipt.reclaim */
    UPDATE autotagger_receipts
    SET lease_token = ${leaseToken}, leased_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + ${input.leaseSeconds} * INTERVAL '1 second'
    WHERE id = ${existing.id}`)
  await query(sql`/* claimAutotaggerReceipt.reclaimAttempt */
    INSERT INTO autotagger_receipt_attempts (receipt_id, attempt_number, lease_token)
    VALUES (${existing.id}, ${nextAttemptNumber}, ${leaseToken})`)
  await query.commit()
  return {
    kind: 'claimed',
    receiptId: existing.id,
    batchId: existing.batch_id,
    leaseToken,
    attemptNumber: nextAttemptNumber,
  }
}
