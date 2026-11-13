import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

declare const lockedNotice: unique symbol

/** Ownership of the notice row that this transaction writes. */
export type LockedCopyrightNotice = {
  readonly noticeId: string
  readonly jurisdiction: string
  readonly [lockedNotice]: true
}

/**
 * Own the notice for a transaction that writes its legal clock or current legal result.
 * Callers that preempt existing restoration work perform that substantive write first.
 */
export async function lockCopyrightNoticeForLegalWrite(
  query: TransactionQuery,
  noticeId: string,
): Promise<LockedCopyrightNotice | null> {
  const { rows } = await query<{ jurisdiction: string }>(sql`/* lockCopyrightNoticeForLegalWrite */
    SELECT jurisdiction FROM copyright_notices WHERE id = ${noticeId} FOR NO KEY UPDATE`)
  return rows[0]
    ? ({ noticeId, jurisdiction: rows[0].jurisdiction } as LockedCopyrightNotice)
    : null
}

/**
 * Called in the transaction that writes a substantive case fact. Only the
 * database clock moves the retention clock; caller-supplied dates must never reach it.
 */
export async function advanceCopyrightLastLegalActivityAt(
  query: TransactionQuery,
  notice: { readonly noticeId: string },
): Promise<void> {
  await query(sql`/* advanceCopyrightLastLegalActivityAt */
    UPDATE copyright_notices
    SET last_legal_activity_at = GREATEST(last_legal_activity_at, clock_timestamp())
    WHERE id = ${notice.noticeId}`)
}

/** Locks the case that owns a restriction, for writers that only know the restriction. */
export async function lockCopyrightNoticeForRestriction(
  query: TransactionQuery,
  restrictionId: string,
): Promise<LockedCopyrightNotice | null> {
  const { rows } = await query<{ copyright_notice_id: string }>(sql`
    /* lockCopyrightNoticeForRestriction */
    SELECT target.copyright_notice_id
    FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE restriction.id = ${restrictionId}`)
  return rows[0] ? lockCopyrightNoticeForLegalWrite(query, rows[0].copyright_notice_id) : null
}
