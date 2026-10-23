import { assertSafeSqlIdentifier } from '@vouchington/postgres/partitions'
import type { TransactionQuery } from '../types.mts'

type DefaultRow = { partition_name: string; size_bytes: string; partition_key: string }
export type ReferencingForeignKey = {
  schema_name: string
  current_schema_name: string
  table_name: string
  constraint_name: string
  definition: string
}

/** Database names and DDL fragments come only from the locked local catalog. */
export async function readDefaultRangeCatalog(
  query: TransactionQuery,
  table: string,
): Promise<{ partitionName: string; sizeBytes: number; partitionKey: string }> {
  const { rows } = await query<DefaultRow>(
    `/* readDefaultRangeCatalog */
    SELECT child.relname AS partition_name,
      pg_total_relation_size(child.oid)::text AS size_bytes,
      pg_get_partkeydef(parent.oid) AS partition_key
    FROM pg_class parent
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    JOIN pg_inherits inheritance ON inheritance.inhparent = parent.oid
    JOIN pg_class child ON child.oid = inheritance.inhrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    WHERE parent_ns.nspname = current_schema() AND parent.relname = $1
      AND child_ns.nspname = current_schema()
      AND parent.relkind = 'p' AND pg_get_expr(child.relpartbound, child.oid) = 'DEFAULT'`,
    [table],
  )
  if (rows.length !== 1) throw new Error(`${table} must have exactly one DEFAULT partition`)
  return {
    partitionName: assertSafeSqlIdentifier(rows[0].partition_name),
    sizeBytes: Number(rows[0].size_bytes),
    partitionKey: rows[0].partition_key,
  }
}

export async function readReferencingForeignKeys(
  query: TransactionQuery,
  table: string,
): Promise<ReferencingForeignKey[]> {
  const { rows } = await query<ReferencingForeignKey>(
    `/* readReferencingForeignKeys */
    SELECT child_ns.nspname AS schema_name, current_schema() AS current_schema_name,
      child.relname AS table_name,
      fk.conname AS constraint_name,
      pg_get_constraintdef(fk.oid) AS definition
    FROM pg_constraint fk
    JOIN pg_class parent ON parent.oid = fk.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    JOIN pg_class child ON child.oid = fk.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    WHERE parent_ns.nspname = current_schema() AND parent.relname = $1
      AND fk.contype = 'f'
      AND fk.conparentid = 0
    ORDER BY child.relname, fk.conname`,
    [table],
  )
  return rows.map(row => {
    if (row.schema_name !== row.current_schema_name) {
      throw new Error(`${table} has a cross-schema referencing foreign key`)
    }
    return {
      schema_name: row.schema_name,
      current_schema_name: row.current_schema_name,
      table_name: assertSafeSqlIdentifier(row.table_name),
      constraint_name: assertSafeSqlIdentifier(row.constraint_name),
      definition: row.definition,
    }
  })
}

export async function readCopyableColumns(
  query: TransactionQuery,
  table: string,
): Promise<string[]> {
  const { rows } = await query<{ attname: string }>(
    `/* readDefaultRangeCopyColumns */
    SELECT attribute.attname
    FROM pg_attribute attribute
    JOIN pg_class parent ON parent.oid = attribute.attrelid
    JOIN pg_namespace ns ON ns.oid = parent.relnamespace
    WHERE ns.nspname = current_schema() AND parent.relname = $1
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
      AND attribute.attgenerated = ''
    ORDER BY attribute.attnum`,
    [table],
  )
  if (rows.length === 0) throw new Error(`${table} has no copyable columns`)
  return rows.map(row => assertSafeSqlIdentifier(row.attname))
}

export async function readDeleteGuards(
  query: TransactionQuery,
  table: string,
): Promise<{ name: string; enabled: string; functionName: string; functionLocal: boolean }[]> {
  const { rows } = await query<{
    tgname: string
    tgenabled: string
    function_name: string
    function_local: boolean
  }>(
    `/* readDefaultRangeDeleteGuards */
    SELECT trigger.tgname, trigger.tgenabled, procedure.proname AS function_name,
      procedure_ns.nspname = current_schema() AS function_local
    FROM pg_trigger trigger
    JOIN pg_class relation ON relation.oid = trigger.tgrelid
    JOIN pg_namespace ns ON ns.oid = relation.relnamespace
    JOIN pg_proc procedure ON procedure.oid = trigger.tgfoid
    JOIN pg_namespace procedure_ns ON procedure_ns.oid = procedure.pronamespace
    WHERE ns.nspname = current_schema() AND relation.relname = $1
      AND NOT trigger.tgisinternal AND (trigger.tgtype & 8) <> 0
    ORDER BY trigger.tgname`,
    [table],
  )
  return rows.map(row => ({
    name: assertSafeSqlIdentifier(row.tgname),
    enabled: row.tgenabled,
    functionName: assertSafeSqlIdentifier(row.function_name),
    functionLocal: row.function_local,
  }))
}

export async function assertNoDirectChildForeignKeys(
  query: TransactionQuery,
  partition: string,
): Promise<void> {
  const { rows } = await query(
    `/* assertNoDirectChildForeignKeys */
    SELECT 1 FROM pg_constraint fk
    JOIN pg_class target ON target.oid = fk.confrelid
    JOIN pg_namespace ns ON ns.oid = target.relnamespace
    WHERE ns.nspname = current_schema() AND target.relname = $1
      AND fk.contype = 'f' AND fk.conparentid = 0 LIMIT 1`,
    [partition],
  )
  if (rows.length > 0) throw new Error(`${partition} has a direct foreign key reference`)
}
