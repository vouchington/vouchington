import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getAdminImportRelationCatalog() {
  const { rows: foreignKeys } = await read<{
    column_name: string
    target_table: string
    delete_rule: string
  }>(
    `/* getAdminImportResultForeignKeys */ SELECT key_column.column_name, target.table_name AS target_table, reference.delete_rule FROM information_schema.table_constraints constraint_definition JOIN information_schema.key_column_usage key_column ON key_column.constraint_schema = constraint_definition.constraint_schema AND key_column.constraint_name = constraint_definition.constraint_name JOIN information_schema.constraint_column_usage target ON target.constraint_schema = constraint_definition.constraint_schema AND target.constraint_name = constraint_definition.constraint_name JOIN information_schema.referential_constraints reference ON reference.constraint_schema = constraint_definition.constraint_schema AND reference.constraint_name = constraint_definition.constraint_name WHERE constraint_definition.constraint_schema = 'public' AND constraint_definition.table_name = 'admin_import_rows' AND key_column.column_name = ANY($1) ORDER BY key_column.column_name`,
    [['topic_id', 'rss_feed_id']],
  )
  const { rows: invariants } = await read<{
    constraint_definition: string
    target_trigger_count: number
  }>(
    `/* getAdminImportTargetInvariants */ SELECT pg_get_constraintdef(constraint_definition.oid) AS constraint_definition, (SELECT COUNT(*)::int FROM pg_trigger WHERE tgrelid = 'admin_import_rows'::regclass AND tgname = 'trigger_admin_import_rows_validate_target' AND NOT tgisinternal) AS target_trigger_count FROM pg_constraint constraint_definition WHERE constraint_definition.conrelid = 'admin_import_rows'::regclass AND constraint_definition.conname = 'chk_admin_import_rows__created_entity_lifecycle'`,
  )
  return { foreignKeys, invariants }
}

export async function getEntityRelationTargetForeignKeys(
  relationTables: string[],
  voteTables: string[],
) {
  const { rows } = await read<{ source_table: string; target_table: string; definition: string }>(
    `/* getEntityRelationTargetForeignKeys */ SELECT conrelid::regclass::text AS source_table, confrelid::regclass::text AS target_table, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype = 'f' AND confrelid = ANY($1::regclass[]) AND (conrelid = ANY($2::regclass[]) OR conrelid = 'vote_integrity_flags'::regclass) ORDER BY source_table, target_table`,
    [relationTables, voteTables],
  )
  return rows
}

export async function getVoteIntegrityStaticTargetForeignKeys() {
  const { rows } = await read<{ target_table: string; definition: string }>(
    `/* getVoteIntegrityStaticTargetForeignKeys */ SELECT confrelid::regclass::text AS target_table, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'vote_integrity_flags'::regclass AND contype = 'f' AND confrelid = ANY($1::regclass[]) ORDER BY target_table`,
    [['agent_moderations', 'rss_feed_items']],
  )
  return rows
}

export async function getMismatchedAdminImportTargetViolationCodes(
  userId: string,
  suffix: string,
): Promise<string[]> {
  const { rows: topicRows } = await write<{ id: string }>(
    sql`INSERT INTO topics (name, slug, bedrock_nova_multimodal_v1_content_sha256) VALUES (${`Admin import ${suffix}`}, ${`admin-import-${suffix}`}, ${`\\x${'0'.repeat(64)}`}) RETURNING id`,
  )
  const { rows: batches } = await write<{ id: string; import_type: string }>(
    sql`INSERT INTO admin_import_batches (import_type, created_by_id, total_rows) VALUES ('topic', ${userId}, 1), ('rss_feed', ${userId}, 1) RETURNING id, import_type`,
  )
  const topicBatchId = batches.find(batch => batch.import_type === 'topic')!.id
  const rssBatchId = batches.find(batch => batch.import_type === 'rss_feed')!.id
  const codes: string[] = []
  for (const operation of [
    () =>
      write(
        sql`INSERT INTO admin_import_rows (batch_id, row_index, input_data, topic_id, completed_at) VALUES (${rssBatchId}, 0, '{}'::jsonb, ${topicRows[0]!.id}, CURRENT_TIMESTAMP)`,
      ),
    async () => {
      const { rows } = await write<{ id: string }>(
        sql`INSERT INTO admin_import_rows (batch_id, row_index, input_data, topic_id, completed_at) VALUES (${topicBatchId}, 0, '{}'::jsonb, ${topicRows[0]!.id}, CURRENT_TIMESTAMP) RETURNING id`,
      )
      await write(
        sql`UPDATE admin_import_rows SET batch_id = ${rssBatchId} WHERE id = ${rows[0]!.id}`,
      )
    },
    () =>
      write(
        sql`UPDATE admin_import_batches SET import_type = 'rss_feed' WHERE id = ${topicBatchId}`,
      ),
  ]) {
    try {
      await operation()
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && typeof error.code === 'string')
        codes.push(error.code)
    }
  }
  return codes
}
