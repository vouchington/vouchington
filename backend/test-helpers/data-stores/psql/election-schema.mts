import { read } from '../../../data-stores/psql/index.mts'

export type PartitionRow = {
  table_name: string
  strategy: string
  partition_key: string
  child_name: string
  child_bound: string
}

export type ConstraintRow = {
  table_name: string
  constraint_type: string
  definition: string
}

export type IndexRow = { table_name: string; index_name: string; definition: string }

export async function getPartitionRows(tableNames: string[]): Promise<PartitionRow[]> {
  const { rows } = await read<PartitionRow>(
    `/* getElectionPartitions */
      SELECT parent.relname AS table_name, partitioned.partstrat AS strategy,
        pg_get_partkeydef(parent.oid) AS partition_key, child.relname AS child_name,
        pg_get_expr(child.relpartbound, child.oid) AS child_bound
      FROM pg_partitioned_table partitioned
      JOIN pg_class parent ON parent.oid = partitioned.partrelid
      JOIN pg_inherits inheritance ON inheritance.inhparent = parent.oid
      JOIN pg_class child ON child.oid = inheritance.inhrelid
      WHERE parent.relname = ANY($1)
      ORDER BY parent.relname, child.relname`,
    [tableNames],
  )
  return rows
}

export async function getConstraintRows(tableNames: string[]): Promise<ConstraintRow[]> {
  const { rows } = await read<ConstraintRow>(
    `/* getElectionConstraints */
      SELECT relation.relname AS table_name, constraint_definition.contype AS constraint_type,
        pg_get_constraintdef(constraint_definition.oid) AS definition
      FROM pg_constraint constraint_definition
      JOIN pg_class relation ON relation.oid = constraint_definition.conrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname = ANY($1)
      ORDER BY relation.relname, constraint_definition.contype, constraint_definition.conname`,
    [tableNames],
  )
  return rows
}

export async function getIndexRows(tableNames: string[]): Promise<IndexRow[]> {
  const { rows } = await read<IndexRow>(
    `/* getElectionIndexes */
      SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = ANY($1)
      ORDER BY tablename, indexname`,
    [tableNames],
  )
  return rows
}

export type UserVouchAggregateColumnRow = {
  column_name: string
  data_type: string
  generation_expression: string | null
}

export async function getUserVouchAggregateColumns(
  columnNames: string[],
): Promise<UserVouchAggregateColumnRow[]> {
  const { rows } = await read<UserVouchAggregateColumnRow>(
    `/* getUserVouchAggregateColumns */
      SELECT column_name, data_type, generation_expression
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = ANY($1)
      ORDER BY column_name`,
    [columnNames],
  )
  return rows
}

export type ElectionUuidV7ColumnRow = {
  table_name: string
  column_name: string
  data_type: string
  column_default: string | null
  generation_expression: string | null
}

export async function getElectionUuidV7Columns(params: {
  idTables: string[]
  configuredVoteTables: string[]
  entityIdColumns: string[]
  allVoteTables: string[]
  relationVoteTables: string[]
}): Promise<ElectionUuidV7ColumnRow[]> {
  const { rows } = await read<ElectionUuidV7ColumnRow>(
    `/* getElectionUuidV7Columns */
      SELECT table_name, column_name, data_type, column_default, generation_expression
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = ANY($1) AND column_name = 'id')
          OR (table_name = ANY($2) AND column_name = ANY($3))
          OR (table_name = ANY($5) AND column_name = 'entity_relation_id')
          OR (table_name = ANY($4) AND column_name = 'created_at'))
      ORDER BY table_name, column_name`,
    [
      params.idTables,
      params.configuredVoteTables,
      params.entityIdColumns,
      params.allVoteTables,
      params.relationVoteTables,
    ],
  )
  return rows
}

export type UuidV7TargetTimestampEvidence = {
  target_id: string
  target_timestamp: Date
}

export async function getUuidV7TargetTimestampEvidence(): Promise<UuidV7TargetTimestampEvidence[]> {
  const { rows } = await read<UuidV7TargetTimestampEvidence>(
    `/* getUuidV7TargetTimestampEvidence */
      WITH sample AS (SELECT uuidv7() AS target_id)
      SELECT target_id, uuid_extract_timestamp(target_id) AS target_timestamp FROM sample`,
  )
  return rows
}
