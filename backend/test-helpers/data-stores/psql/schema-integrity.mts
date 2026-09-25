import { read } from '@data-stores/psql'

export type NamedConstraint = { table_name: string; constraint_name: string }
export type DuplicateIndex = { table_name: string; index_names: string }
export type RelationPresence = { table_name: string; relation: string | null }
export type SupportHistoryRelation = {
  table_name: string
  relation_kind: string
  is_partitioned: boolean
}
export type ForeignKey = { column_name: string; target_table: string; delete_rule: string }
export type ResolverForeignKey = { table_name: string; delete_rule: string }

export async function getUnvalidatedPublicConstraints(): Promise<NamedConstraint[]> {
  const { rows } = await read<NamedConstraint>(
    `/* getUnvalidatedPublicConstraints */
      SELECT conrelid::regclass::text AS table_name, conname AS constraint_name
      FROM pg_constraint constraint_definition
      JOIN pg_namespace namespace ON namespace.oid = constraint_definition.connamespace
      WHERE namespace.nspname = 'public' AND NOT constraint_definition.convalidated
      ORDER BY table_name, constraint_name`,
  )
  return rows
}

export async function getCanonicalDuplicateIndexes(): Promise<DuplicateIndex[]> {
  const { rows } = await read<DuplicateIndex>(
    `/* getCanonicalDuplicateIndexes */
      SELECT index_definition.indrelid::regclass::text AS table_name,
        string_agg(index_relation.relname::text, ', ' ORDER BY index_relation.relname) AS index_names
      FROM pg_index index_definition
      JOIN pg_class index_relation ON index_relation.oid = index_definition.indexrelid
      JOIN pg_namespace namespace ON namespace.oid = index_relation.relnamespace
      WHERE namespace.nspname = 'public' AND index_definition.indisvalid AND index_definition.indisready
      GROUP BY index_definition.indrelid, index_relation.relam, index_definition.indisunique,
        index_definition.indisprimary, index_definition.indisexclusion, index_definition.indimmediate,
        index_definition.indnullsnotdistinct, index_definition.indnkeyatts, index_definition.indnatts,
        index_definition.indkey, index_definition.indcollation, index_definition.indclass,
        index_definition.indoption, pg_get_expr(index_definition.indexprs, index_definition.indrelid),
        pg_get_expr(index_definition.indpred, index_definition.indrelid)
      HAVING COUNT(*) > 1
      ORDER BY table_name, index_names`,
  )
  return rows
}

export async function getRemovedTablePresence(tableNames: string[]): Promise<RelationPresence[]> {
  const { rows } = await read<RelationPresence>(
    `/* getRemovedPostgresTables */
      SELECT table_name, to_regclass('public.' || table_name)::text AS relation
      FROM unnest($1::text[]) AS table_name
      ORDER BY array_position($1::text[], table_name)`,
    [tableNames],
  )
  return rows
}

export async function getSupportHistoryRelations(
  tableNames: string[],
): Promise<SupportHistoryRelation[]> {
  const { rows } = await read<SupportHistoryRelation>(
    `/* getSupportHistoryTableKinds */
      SELECT relation.relname AS table_name, relation.relkind AS relation_kind,
        EXISTS (SELECT 1 FROM pg_partitioned_table WHERE partrelid = relation.oid) AS is_partitioned
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname = ANY($1)
      ORDER BY table_name`,
    [tableNames],
  )
  return rows
}

export async function getCuratedAsideForeignKeys(): Promise<ForeignKey[]> {
  const { rows } = await read<ForeignKey>(
    `/* getCuratedAsideForeignKeys */
      SELECT key_column.column_name, target.table_name AS target_table, reference.delete_rule
      FROM information_schema.table_constraints constraint_definition
      JOIN information_schema.key_column_usage key_column
        ON key_column.constraint_schema = constraint_definition.constraint_schema
       AND key_column.constraint_name = constraint_definition.constraint_name
      JOIN information_schema.constraint_column_usage target
        ON target.constraint_schema = constraint_definition.constraint_schema
       AND target.constraint_name = constraint_definition.constraint_name
      JOIN information_schema.referential_constraints reference
        ON reference.constraint_schema = constraint_definition.constraint_schema
       AND reference.constraint_name = constraint_definition.constraint_name
      WHERE constraint_definition.constraint_schema = 'public'
        AND constraint_definition.table_name = 'curated_aside_items'
        AND constraint_definition.constraint_type = 'FOREIGN KEY'
      ORDER BY key_column.column_name`,
  )
  return rows
}

export async function hasCuratedAsideSingleTargetConstraint(): Promise<boolean> {
  const { rows } = await read<{ constraint_definition: string }>(
    `/* getCuratedAsideTargetCheck */
      SELECT pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint
      WHERE conrelid = 'curated_aside_items'::regclass
        AND conname = 'chk_curated_aside_items__one_target'`,
  )
  return (
    rows.length === 1 &&
    rows[0]!.constraint_definition.includes('num_nonnulls(topic_id, rss_feed_id, community_id) = 1')
  )
}

export async function getModerationResolverForeignKeys(
  tableNames: string[],
): Promise<ResolverForeignKey[]> {
  const { rows } = await read<ResolverForeignKey>(
    `/* getModerationResolverForeignKeys */
      SELECT tc.table_name, rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_schema = tc.constraint_schema AND kcu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_schema = tc.constraint_schema AND rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'resolved_by_id' AND tc.table_name = ANY($1)
      ORDER BY tc.table_name`,
    [tableNames],
  )
  return rows
}
