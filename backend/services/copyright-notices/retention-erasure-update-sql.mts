import sql, { type SQLStatement } from 'sql-template-strings'
import { COPYRIGHT_ERASED_CIPHERTEXT } from './erased-ciphertext.mts'
import type { CopyrightRetentionErasureTable } from './retention-erasure-table.mts'

type CopyrightRetentionErasureKind = CopyrightRetentionErasureTable['columns'][string]

const OVERWRITE: Record<CopyrightRetentionErasureKind, (column: string) => string> = {
  redact: column =>
    `CASE WHEN ${column} IS NULL THEN NULL ELSE '${COPYRIGHT_ERASED_CIPHERTEXT}' END`,
  null: () => 'NULL',
  hex64: column =>
    `CASE WHEN ${column} IS NULL THEN NULL ELSE encode(sha256(convert_to('erased:' || id::text, 'UTF8')), 'hex') END`,
  digest: () => `sha256(convert_to('erased:' || id::text, 'UTF8'))`,
}

/** One bounded raw candidate page, shared by parent lifetime locking and the actual overwrite. */
export function copyrightErasureCandidateSql(
  spec: CopyrightRetentionErasureTable,
  noticeId: string,
  pageSize: number,
): SQLStatement {
  const changed = Object.entries(spec.columns)
    .map(([column, kind]) => `${column} IS DISTINCT FROM (${OVERWRITE[kind](column)})`)
    .join(' OR ')
  if (!spec.intakeOwnerColumn)
    throw new Error('Copyright redaction table has no intake owner column')
  return sql`SELECT `
    .append(spec.intakeOwnerColumn)
    .append(' FROM ')
    .append(spec.table)
    .append(' WHERE ')
    .append(spec.scope(noticeId))
    .append(` AND (${changed})`)
    .append(sql` LIMIT ${pageSize}`)
}

/** At most one raw page reaches immutable guards. Busy rows remain on this phase for a later call. */
export function eraseCopyrightRetentionTableSql(
  spec: CopyrightRetentionErasureTable,
  noticeId: string,
  pageSize: number,
  tokenIds?: readonly string[],
): SQLStatement {
  const assignments = Object.entries(spec.columns)
    .map(([column, kind]) => `${column} = ${OVERWRITE[kind](column)}`)
    .join(', ')
  const query = sql`/* eraseCopyrightRetentionTablePage */ WITH candidate AS MATERIALIZED (`
    .append('SELECT tableoid, ctid FROM ')
    .append(spec.table)
    .append(' WHERE ')
    .append(spec.scope(noticeId))
    .append(' AND (')
    .append(
      Object.entries(spec.columns)
        .map(([column, kind]) => `${column} IS DISTINCT FROM (${OVERWRITE[kind](column)})`)
        .join(' OR '),
    )
    .append(')')
  if (tokenIds) query.append(sql` AND id = ANY(${[...tokenIds]}::uuid[])`)
  return query
    .append(sql` LIMIT ${pageSize + 1}), page AS MATERIALIZED (`)
    .append('SELECT target.tableoid, target.ctid FROM ')
    .append(spec.table)
    .append(sql` target JOIN (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}) raw
      ON raw.tableoid = target.tableoid AND raw.ctid = target.ctid FOR UPDATE OF target SKIP LOCKED), updated AS (`)
    .append(
      `UPDATE ${spec.table} target SET ${assignments} FROM page WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)`,
    ).append(sql` SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
      (SELECT count(*) FROM updated)::integer AS updated`)
}
