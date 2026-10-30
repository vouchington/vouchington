import type { SQLStatement } from 'sql-template-strings'

/** Existing raw page/batch caps remain separate from this physical-delete ceiling. */
export const COPYRIGHT_MINIMAL_PURGE_MAX_PHYSICAL_ROWS = 100
// Root + held submission + two possible assessment identities + one territorial identity +
// one intake/current screening + erasure marker + three PK notice generation/activity companions.
// Up to eight enum-keyed operational cursors may also be cleared by FK SET NULL; the
// reviewed catalog predicate binds that domain cardinality. Continuation and retained case
// identity are charged separately by the postroot drain.
export const COPYRIGHT_MINIMAL_PURGE_MAX_TERMINAL_ROWS = 19
export type CopyrightMinimalPurgePageOutcome = 'progress' | 'purged' | 'ineligible' | 'stale'
export type CopyrightMinimalPurgePageResult = {
  outcome: CopyrightMinimalPurgePageOutcome
  physicalRows: number
  requiredRows?: number
}
export type CopyrightMinimalPurgePhase = {
  table: string
  /** A current owned unit may cascade within the same statement; all older children drain first. */
  maxPhysicalRowsPerParent?: 2 | 4 | 9
  /** Raw keyset pages advance even when every selected identity is still current. */
  scanCursor?: boolean
  statement: (noticeId: string, pageSize: number, cursor?: string | null) => SQLStatement
}
