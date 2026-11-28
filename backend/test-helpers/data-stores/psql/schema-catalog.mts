import { read } from '@data-stores/psql'

export type ExtensionTableColumn = {
  column_name: string
  is_generated: string
  column_default: string | null
}

export async function readExtensionTableColumns(
  tableName: string,
): Promise<ExtensionTableColumn[]> {
  const { rows } = await read<ExtensionTableColumn>(
    `/* readExtensionTableColumns */
      SELECT
        column_name,
        is_generated,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = ANY($2::TEXT[])`,
    [tableName, ['id', 'post_id', 'topic_id', 'created_at', 'status']],
  )
  return rows
}

export type PublicIndexDefinition = {
  indexname: string
  indexdef: string
}

export async function readPublicIndexDefinition(
  tableName: string,
  indexName: string,
): Promise<{ indexdef: string }[]> {
  const { rows } = await read<{ indexdef: string }>(
    `/* readPublicIndexDefinition */
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = $1
        AND indexname = $2
      LIMIT 1`,
    [tableName, indexName],
  )
  return rows
}

export async function readPublicIndexDefinitions(
  indexNames: string[],
  tableName?: string,
): Promise<PublicIndexDefinition[]> {
  const { rows } = await read<PublicIndexDefinition>(
    `/* readPublicIndexDefinitions */
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND ($2::text IS NULL OR tablename = $2)
        AND indexname = ANY($1::text[])
      ORDER BY indexname`,
    [indexNames, tableName ?? null],
  )
  return rows
}

export type ForeignKeyWithLeadingIndex = {
  target: string
  delete_action: string
  validated: boolean
  leading_column: string | null
}

export async function readForeignKeyWithLeadingIndex(
  tableName: string,
  constraintName: string,
): Promise<ForeignKeyWithLeadingIndex[]> {
  const { rows } = await read<ForeignKeyWithLeadingIndex>(
    `/* readForeignKeyWithLeadingIndex */
      SELECT c.confrelid::regclass::text AS target, c.confdeltype::text AS delete_action,
        c.convalidated AS validated,
        (SELECT a.attname FROM pg_index i
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
          WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1] AND i.indisvalid
          LIMIT 1) AS leading_column
      FROM pg_constraint c
      WHERE c.conrelid = $1::regclass AND c.conname = $2 AND c.conparentid = 0`,
    [tableName, constraintName],
  )
  return rows
}

export type PublicTriggerDefinition = {
  definition: string
  function_definition: string
}

export async function readPublicTriggerDefinition(
  tableName: string,
  triggerName: string,
): Promise<PublicTriggerDefinition[]> {
  const { rows } = await read<PublicTriggerDefinition>(
    `/* readPublicTriggerDefinition */
      SELECT
        pg_get_triggerdef(trigger_definition.oid) AS definition,
        pg_get_functiondef(trigger_definition.tgfoid) AS function_definition
      FROM pg_trigger trigger_definition
      JOIN pg_class relation ON relation.oid = trigger_definition.tgrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND trigger_definition.tgrelid = $1::regclass
        AND trigger_definition.tgname = $2
        AND NOT trigger_definition.tgisinternal`,
    [tableName, triggerName],
  )
  return rows
}

export type PublicTriggerSummary = {
  owner: string
  trigger_name: string
}

export async function readPublicNonInternalTriggers(
  tableNames: readonly string[],
): Promise<PublicTriggerSummary[]> {
  const { rows } = await read<PublicTriggerSummary>(
    `/* readPublicNonInternalTriggers */
      SELECT
        trigger_definition.tgrelid::regclass::text AS owner,
        trigger_definition.tgname AS trigger_name
      FROM pg_trigger trigger_definition
      JOIN pg_class relation ON relation.oid = trigger_definition.tgrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND NOT trigger_definition.tgisinternal
        AND trigger_definition.tgrelid = ANY($1::regclass[])`,
    [[...tableNames]],
  )
  return rows
}

export type PartitionChildPair = {
  parent: string
  child: string
}

export async function readPartitionChildNames(
  parentTableNames: readonly string[],
): Promise<PartitionChildPair[]> {
  const { rows } = await read<PartitionChildPair>(
    `/* readPartitionChildNames */
      SELECT inhparent::regclass::text AS parent, inhrelid::regclass::text AS child
      FROM pg_inherits
      WHERE inhparent = ANY($1::regclass[])`,
    [[...parentTableNames]],
  )
  return rows
}

export async function readTablesReferencingTarget(targetTable: string): Promise<string[]> {
  const { rows } = await read<{ name: string }>(
    `/* readTablesReferencingTarget */
      SELECT DISTINCT c.conrelid::regclass::text AS name
      FROM pg_constraint c
      JOIN pg_class child ON child.oid = c.conrelid
      WHERE c.contype = 'f' AND c.confrelid = $1::regclass
        AND NOT child.relispartition`,
    [targetTable],
  )
  return rows.map(row => row.name)
}

export async function readPostgresUuidv7(): Promise<string> {
  const { rows } = await read<{ id: string }>('/* readPostgresUuidv7 */ SELECT uuidv7() AS id')
  return rows[0]!.id
}
