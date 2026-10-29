import type { TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'

/** A real shared advisory lifetime retained by exactly one transaction. */
export class CopyrightNoticeLifetime {
  private readonly query: TransactionQuery
  private readonly noticeId: string
  private constructor(query: TransactionQuery, noticeId: string) {
    this.query = query
    this.noticeId = noticeId
  }
  static async acquire(
    query: TransactionQuery,
    noticeId: string,
  ): Promise<CopyrightNoticeLifetime> {
    const { rows } = await query<{ locked: boolean }>(sql`/* lockCopyrightNoticeLifetime */
      SELECT pg_try_advisory_xact_lock_shared(hashtextextended('copyright-erasure:' || ${noticeId}::uuid::text, 0)) AS locked`)
    assert(rows[0]?.locked, 409, 'Copyright case erasure is in progress')
    return new CopyrightNoticeLifetime(query, noticeId)
  }
  assertTransaction(query: TransactionQuery): void {
    if (query !== this.query)
      throw new Error('Copyright notice lifetime is outside its transaction')
  }
  covers(query: TransactionQuery, noticeId: string): boolean {
    this.assertTransaction(query)
    return this.noticeId === noticeId
  }
}

/** Writers acquire this before owner rows or children; never wait for it under a child lock. */
export function lockCopyrightNoticeLifetime(query: TransactionQuery, noticeId: string) {
  return CopyrightNoticeLifetime.acquire(query, noticeId)
}
