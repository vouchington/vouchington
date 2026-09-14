import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import { createLocalTestUser } from '../../../test-helpers/data-stores/psql/users.mts'
import {
  getAdminImportRelationCatalog,
  getEntityRelationTargetForeignKeys,
  getMismatchedAdminImportTargetViolationCodes,
  getVoteIntegrityStaticTargetForeignKeys,
} from '../../../test-helpers/data-stores/psql/relation-integrity.mts'
import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'

describe('PostgreSQL relation schema integrity', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('uses concrete foreign keys for admin import results', async () => {
    const { foreignKeys: rows, invariants } = await getAdminImportRelationCatalog()

    expect(rows.map(row => `${row.column_name}:${row.target_table}:${row.delete_rule}`)).toEqual([
      'crm_contact_id:crm_contacts:RESTRICT',
      'rss_feed_id:rss_feeds:RESTRICT',
      'topic_id:topics:RESTRICT',
    ])

    expect(invariants).toHaveLength(1)
    expect(invariants[0]!.constraint_definition).toContain('completed_at IS NOT NULL')
    expect(invariants[0]!.constraint_definition).toContain(
      'num_nonnulls(topic_id, crm_contact_id, rss_feed_id) = 1',
    )
    expect(invariants[0]!.target_trigger_count).toBe(1)
  })

  it('rejects completed admin import targets that do not match the batch type', async () => {
    const user = await createLocalTestUser()
    await expect(
      getMismatchedAdminImportTargetViolationCodes(user.id, randomUUID()),
    ).resolves.toEqual(['23514', '23514', '23514'])
  })

  it('uses concrete composite foreign keys for relation votes and integrity flags', async () => {
    const electionRelations = entityRelationMetadatum.filter(metadata => metadata.election)
    const relationTables = electionRelations.map(metadata => metadata.table_name)
    const voteTables = electionRelations.map(getEntityRelationVoteTableName)
    const rows = await getEntityRelationTargetForeignKeys(relationTables, voteTables)

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
    const rows = await getVoteIntegrityStaticTargetForeignKeys()

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
