import { onGracefulShutdown } from '@data-stores/graceful-shutdown'
import { afterAll, describe, expect, it } from 'vitest'
import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'
import { getElectionIndexName } from '../config-driven/utils/election-sql-identifiers.mts'
import { VOTE_SCHEMA_CONFIGS } from '../config-driven/utils/election-schema-config.mts'
import { NON_DEFAULT_ID_EXCEPTIONS } from '../../../test-helpers/schema-growth-test-policies.mts'
import {
  getConstraintRows,
  getElectionUuidV7Columns,
  getIndexRows,
  getPartitionRows,
  getUserVouchAggregateColumns,
  getUuidV7TargetTimestampEvidence,
} from '../../../test-helpers/data-stores/psql/election-schema.mts'
import { getRemovedTablePresence } from '../../../test-helpers/data-stores/psql/schema-integrity.mts'

const electionRelations = entityRelationMetadatum.filter(metadata => metadata.election)
const configuredVoteTables = VOTE_SCHEMA_CONFIGS.map(config => config.voteTable)
const relationVoteTables = electionRelations.map(getEntityRelationVoteTableName)

describe('election schema partitioning', () => {
  afterAll(async () => {
    await onGracefulShutdown('SIGTERM')
  })

  it('range-partitions every configured vote table on its target with one DEFAULT child', async () => {
    const rows = await getPartitionRows(configuredVoteTables)

    for (const config of VOTE_SCHEMA_CONFIGS) {
      expect(rows.filter(row => row.table_name === config.voteTable)).toEqual([
        {
          table_name: config.voteTable,
          strategy: 'r',
          partition_key: `RANGE (${config.entityIdColumn})`,
          child_name: `${config.voteTable}__default`,
          child_bound: 'DEFAULT',
        },
      ])
    }
  })

  it('keeps the configured vote PKs, FKs, and target/voter indexes on every parent', async () => {
    const [constraints, indexes] = await Promise.all([
      getConstraintRows(configuredVoteTables),
      getIndexRows(configuredVoteTables),
    ])

    for (const config of VOTE_SCHEMA_CONFIGS) {
      const tableConstraints = constraints.filter(row => row.table_name === config.voteTable)
      expect(
        tableConstraints.filter(row => row.constraint_type === 'p').map(row => row.definition),
      ).toEqual([`PRIMARY KEY (${config.entityIdColumn}, id)`])
      expect(
        tableConstraints.some(row =>
          row.definition.includes('FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'),
        ),
      ).toBe(true)

      const targetForeignKey =
        config.entityType === 'agent_moderation'
          ? 'FOREIGN KEY (post_id, agent_moderation_id) REFERENCES agent_moderations(post_id, id) ON DELETE CASCADE'
          : `FOREIGN KEY (${config.entityIdColumn}) REFERENCES ${config.entityTable}(id) ON DELETE CASCADE`
      expect(tableConstraints.some(row => row.definition.includes(targetForeignKey))).toBe(true)

      const tableIndexes = indexes.filter(row => row.table_name === config.voteTable)
      expect(tableIndexes.map(row => row.index_name)).toEqual(
        expect.arrayContaining([
          `idx_${config.voteTable}__${config.entityIdColumn}__user_id__id`,
          `idx_${config.voteTable}__user_id__${config.entityIdColumn}__id`,
        ]),
      )
      expect(tableIndexes.map(row => row.index_name)).not.toContain(
        `idx_${config.voteTable}__${config.entityIdColumn}__id`,
      )
      expect(
        tableIndexes.find(
          row =>
            row.index_name === `idx_${config.voteTable}__user_id__${config.entityIdColumn}__id`,
        )?.definition,
      ).toContain(`(user_id, ${config.entityIdColumn}, id DESC)`)
    }
  })

  it('range-partitions every concrete relation vote parent with its own composite foreign key', async () => {
    const [leafRows, constraints, indexes] = await Promise.all([
      getPartitionRows(relationVoteTables),
      getConstraintRows(relationVoteTables),
      getIndexRows(relationVoteTables),
    ])
    expect(relationVoteTables).toHaveLength(17)
    for (const metadata of electionRelations) {
      const voteTable = getEntityRelationVoteTableName(metadata)
      expect(
        constraints
          .filter(row => row.table_name === voteTable && row.constraint_type === 'p')
          .map(row => row.definition),
      ).toEqual(['PRIMARY KEY (entity_relation_id, id)'])
      expect(
        indexes.filter(row => row.table_name === voteTable).map(row => row.index_name),
      ).toEqual(
        expect.arrayContaining(
          ['relation__user__id', 'user__relation__id'].map(suffix =>
            getElectionIndexName(voteTable, suffix),
          ),
        ),
      )
      expect(
        indexes.filter(row => row.table_name === voteTable).map(row => row.index_name),
      ).not.toContain(getElectionIndexName(voteTable, 'relation__id'))
      expect(leafRows.filter(row => row.table_name === voteTable)).toEqual([
        {
          table_name: voteTable,
          strategy: 'r',
          partition_key: 'RANGE (entity_relation_id)',
          child_name: `${voteTable}__default`,
          child_bound: 'DEFAULT',
        },
      ])
      expect(
        constraints.some(
          row =>
            row.table_name === voteTable &&
            row.definition.includes(
              `FOREIGN KEY (subject_id, entity_relation_id) REFERENCES ${metadata.table_name}(subject_id, id) ON DELETE CASCADE`,
            ),
        ),
      ).toBe(true)
    }
  })

  it('stores vouch aggregates on users and keeps removed bot/vouch extension tables absent', async () => {
    const columns = await getUserVouchAggregateColumns([
      'votes_count_down',
      'votes_count_none',
      'votes_count_up',
      'votes_score_down',
      'votes_score_net',
      'votes_score_none',
      'votes_score_sort',
      'votes_score_up',
    ])
    expect(columns.map(column => column.column_name)).toEqual([
      'votes_count_down',
      'votes_count_none',
      'votes_count_up',
      'votes_score_down',
      'votes_score_net',
      'votes_score_none',
      'votes_score_sort',
      'votes_score_up',
    ])
    expect(
      columns.find(column => column.column_name === 'votes_score_sort')?.generation_expression,
    ).toContain('fn_wilson_score_lower_bound')
    expect(
      columns.find(column => column.column_name === 'votes_score_net')?.generation_expression,
    ).toContain('votes_score_up - votes_score_down')

    const removedTables = ['user_bot_elections', 'user_bot_votes', 'user_vouch_elections']
    const removed = await getRemovedTablePresence(removedTables)
    expect(removed).toEqual(
      removedTables.toSorted().map(table_name => ({ table_name, relation: null })),
    )
  })

  it('uses UUIDv7 target keys for routing and derives vote timestamps from vote UUIDv7 IDs', async () => {
    const columns = await getElectionUuidV7Columns({
      idTables: [
        ...VOTE_SCHEMA_CONFIGS.map(config => config.entityTable),
        ...electionRelations.map(metadata => metadata.table_name),
      ],
      configuredVoteTables,
      entityIdColumns: VOTE_SCHEMA_CONFIGS.map(config => config.entityIdColumn),
      allVoteTables: [...configuredVoteTables, ...relationVoteTables],
      relationVoteTables,
    })

    for (const config of VOTE_SCHEMA_CONFIGS) {
      const idPolicy = config.entityTable
        ? NON_DEFAULT_ID_EXCEPTIONS.get(config.entityTable)
        : undefined
      expect(columns).toContainEqual(
        expect.objectContaining({
          table_name: config.entityTable,
          column_name: 'id',
          data_type: 'uuid',
          column_default: idPolicy?.policy === 'uuidv7' ? null : 'uuidv7()',
        }),
      )
      expect(columns).toContainEqual(
        expect.objectContaining({
          table_name: config.voteTable,
          column_name: config.entityIdColumn,
          data_type: 'uuid',
        }),
      )
      expect(columns).toContainEqual(
        expect.objectContaining({
          table_name: config.voteTable,
          column_name: 'created_at',
          generation_expression: 'uuid_extract_timestamp(id)',
        }),
      )
    }
    for (const metadata of electionRelations) {
      expect(columns).toContainEqual(
        expect.objectContaining({
          table_name: metadata.table_name,
          column_name: 'id',
          data_type: 'uuid',
          column_default: 'uuidv7()',
        }),
      )
    }
    for (const voteTable of relationVoteTables) {
      expect(columns).toContainEqual(
        expect.objectContaining({
          table_name: voteTable,
          column_name: 'entity_relation_id',
          data_type: 'uuid',
        }),
      )
      expect(columns).toContainEqual(
        expect.objectContaining({
          table_name: voteTable,
          column_name: 'created_at',
          generation_expression: 'uuid_extract_timestamp(id)',
        }),
      )
    }

    const samples = await getUuidV7TargetTimestampEvidence()
    expect(samples[0]?.target_id).toMatch(/^0[0-9a-f]{7}-[0-9a-f]{4}-7[0-9a-f]{3}-/)
    expect(Math.abs(Date.now() - samples[0]!.target_timestamp.getTime())).toBeLessThan(5_000)
  })
})
