import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, read, write } from '../index.mts'
import { createLocalTestUser } from '../test-helpers/users.mts'
import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'

describe('PostgreSQL relation schema integrity', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('uses concrete foreign keys for admin import results', async () => {
    const { rows } = await read<{
      column_name: string
      target_table: string
      delete_rule: string
    }>(
      `/* getAdminImportResultForeignKeys */
      SELECT
        key_column.column_name,
        target.table_name AS target_table,
        reference.delete_rule
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
        AND constraint_definition.table_name = 'admin_import_rows'
        AND key_column.column_name = ANY($1)
      ORDER BY key_column.column_name`,
      [['topic_id', 'crm_contact_id', 'rss_feed_id']],
    )

    expect(rows.map(row => `${row.column_name}:${row.target_table}:${row.delete_rule}`)).toEqual([
      'crm_contact_id:crm_contacts:RESTRICT',
      'rss_feed_id:rss_feeds:RESTRICT',
      'topic_id:topics:RESTRICT',
    ])

    const { rows: invariants } = await read<{
      constraint_definition: string
      target_trigger_count: number
    }>(`/* getAdminImportTargetInvariants */
      SELECT
        pg_get_constraintdef(constraint_definition.oid) AS constraint_definition,
        (
          SELECT COUNT(*)::int
          FROM pg_trigger
          WHERE tgrelid = 'admin_import_rows'::regclass
            AND tgname = 'trigger_admin_import_rows_validate_target'
            AND NOT tgisinternal
        ) AS target_trigger_count
      FROM pg_constraint constraint_definition
      WHERE constraint_definition.conrelid = 'admin_import_rows'::regclass
        AND constraint_definition.conname = 'chk_admin_import_rows__created_entity_lifecycle'`)
    expect(invariants).toHaveLength(1)
    expect(invariants[0]!.constraint_definition).toContain('completed_at IS NOT NULL')
    expect(invariants[0]!.constraint_definition).toContain(
      'num_nonnulls(topic_id, crm_contact_id, rss_feed_id) = 1',
    )
    expect(invariants[0]!.target_trigger_count).toBe(1)
  })

  it('rejects completed admin import targets that do not match the batch type', async () => {
    const user = await createLocalTestUser()
    const suffix = randomUUID()
    const { rows: topicRows } = await write<{ id: string }>(sql`
      INSERT INTO topics (name, slug, bedrock_nova_multimodal_v1_content_sha256)
      VALUES (${`Admin import ${suffix}`}, ${`admin-import-${suffix}`}, ${`\\x${'0'.repeat(64)}`})
      RETURNING id
    `)
    const { rows: batches } = await write<{ id: string; import_type: string }>(sql`
      INSERT INTO admin_import_batches (import_type, created_by_id, total_rows)
      VALUES ('topic', ${user.id}, 1), ('rss_feed', ${user.id}, 1)
      RETURNING id, import_type
    `)
    const topicBatchId = batches.find(batch => batch.import_type === 'topic')!.id
    const rssBatchId = batches.find(batch => batch.import_type === 'rss_feed')!.id

    await expect(
      write(sql`/* rejectMismatchedAdminImportInsert */
        INSERT INTO admin_import_rows (
          batch_id, row_index, input_data, topic_id, completed_at
        ) VALUES (
          ${rssBatchId}, 0, '{}'::jsonb, ${topicRows[0]!.id}, CURRENT_TIMESTAMP
        )`),
    ).rejects.toMatchObject({ code: '23514' })

    const { rows: completedRows } = await write<{ id: string }>(sql`
      INSERT INTO admin_import_rows (
        batch_id, row_index, input_data, topic_id, completed_at
      ) VALUES (
        ${topicBatchId}, 0, '{}'::jsonb, ${topicRows[0]!.id}, CURRENT_TIMESTAMP
      )
      RETURNING id
    `)
    await expect(
      write(sql`/* rejectMismatchedAdminImportBatchMove */
        UPDATE admin_import_rows
        SET batch_id = ${rssBatchId}
        WHERE id = ${completedRows[0]!.id}`),
    ).rejects.toMatchObject({ code: '23514' })

    await expect(
      write(sql`/* rejectAdminImportBatchTypeRewrite */
        UPDATE admin_import_batches
        SET import_type = 'rss_feed'
        WHERE id = ${topicBatchId}`),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('uses concrete composite foreign keys for relation votes and integrity flags', async () => {
    const electionRelations = entityRelationMetadatum.filter(metadata => metadata.election)
    const relationTables = electionRelations.map(metadata => metadata.table_name)
    const voteTables = electionRelations.map(getEntityRelationVoteTableName)
    const { rows } = await read<{
      source_table: string
      target_table: string
      definition: string
    }>(
      `/* getEntityRelationTargetForeignKeys */
      SELECT
        conrelid::regclass::text AS source_table,
        confrelid::regclass::text AS target_table,
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE contype = 'f'
        AND confrelid = ANY($1::regclass[])
        AND (conrelid = ANY($2::regclass[]) OR conrelid = 'vote_integrity_flags'::regclass)
      ORDER BY source_table, target_table`,
      [relationTables, voteTables],
    )

    for (const metadata of electionRelations) {
      const targetRows = rows.filter(row => row.target_table === metadata.table_name)
      expect(targetRows.map(row => row.source_table).sort()).toEqual(
        [getEntityRelationVoteTableName(metadata), 'vote_integrity_flags'].sort(),
      )
      for (const row of targetRows) {
        expect(row.definition).toContain('FOREIGN KEY (')
        expect(row.definition).toContain('subject_id')
        expect(row.definition).toContain('ON DELETE CASCADE')
      }
    }
  })

  it('uses real RSS item and agent moderation vote-integrity foreign keys', async () => {
    const { rows } = await read<{ target_table: string; definition: string }>(
      `/* getVoteIntegrityStaticTargetForeignKeys */
        SELECT
          confrelid::regclass::text AS target_table,
          pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'vote_integrity_flags'::regclass
          AND contype = 'f'
          AND confrelid = ANY($1::regclass[])
        ORDER BY target_table`,
      [['agent_moderations', 'rss_feed_items']],
    )

    expect(rows.map(row => row.target_table)).toEqual(['agent_moderations', 'rss_feed_items'])
    expect(rows.find(row => row.target_table === 'rss_feed_items')?.definition).toContain(
      'FOREIGN KEY (rss_feed_item_id)',
    )
    expect(rows.find(row => row.target_table === 'agent_moderations')?.definition).toContain(
      'FOREIGN KEY (agent_moderation_post_id, agent_moderation_id)',
    )
    for (const row of rows) expect(row.definition).toContain('ON DELETE CASCADE')
  })
})
