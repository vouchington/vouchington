import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

declare const lockedNotice: unique symbol

/** Proof that this transaction took the notice row lock before any child-row lock or insert. */
export type LockedCopyrightNotice = {
  readonly noticeId: string
  readonly jurisdiction: string
  readonly [lockedNotice]: true
}

/**
 * Take the notice row lock first in every transaction that writes a legal fact. Holds, closures
 * and purges lock the notice with FOR UPDATE, so a writer that locked children first and upgraded
 * to the notice at the end would deadlock against them.
 */
export async function lockCopyrightNoticeForLegalWrite(
  query: TransactionQuery,
  noticeId: string,
): Promise<LockedCopyrightNotice | null> {
  const { rows } = await query<{ jurisdiction: string }>(sql`/* lockCopyrightNoticeForLegalWrite */
    SELECT jurisdiction FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE`)
  return rows[0]
    ? ({ noticeId, jurisdiction: rows[0].jurisdiction } as LockedCopyrightNotice)
    : null
}

/** Called in the transaction that writes a substantive case fact, after the notice lock. */
export async function advanceCopyrightLastLegalActivityAt(
  query: TransactionQuery,
  locked: LockedCopyrightNotice,
  at: Date = new Date(),
): Promise<void> {
  await query(sql`/* advanceCopyrightLastLegalActivityAt */
    UPDATE copyright_notices
    SET last_legal_activity_at = GREATEST(last_legal_activity_at, ${at}, clock_timestamp())
    WHERE id = ${locked.noticeId}`)
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
