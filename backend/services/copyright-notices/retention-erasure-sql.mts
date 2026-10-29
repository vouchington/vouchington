import sql, { type SQLStatement } from 'sql-template-strings'
import { COPYRIGHT_ERASED_CIPHERTEXT } from './erased-ciphertext.mts'
import type {
  CopyrightRetentionErasureKind,
  CopyrightRetentionErasureTable,
} from './retention-erasure-spec.mts'

const OVERWRITE: Record<CopyrightRetentionErasureKind, (column: string) => string> = {
  redact: column =>
    `CASE WHEN ${column} IS NULL THEN NULL ELSE '${COPYRIGHT_ERASED_CIPHERTEXT}' END`,
  null: () => 'NULL',
  hex64: column =>
    `CASE WHEN ${column} IS NULL THEN NULL
      ELSE encode(sha256(convert_to('erased:' || id::text, 'UTF8')), 'hex') END`,
  digest: () => `sha256(convert_to('erased:' || id::text, 'UTF8'))`,
}

/** The in-place overwrite of one table's rows for a notice. Names come only from the spec. */
export function eraseCopyrightRetentionTableSql(
  spec: CopyrightRetentionErasureTable,
  noticeId: string,
): SQLStatement {
  const assignments = Object.entries(spec.columns)
    .map(([column, kind]) => `${column} = ${OVERWRITE[kind](column)}`)
    .join(', ')
  return sql`/* eraseCopyrightRetentionTable */`
    .append(`\n    UPDATE ${spec.table} SET ${assignments} WHERE `)
    .append(spec.scope(noticeId))
}
