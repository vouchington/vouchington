import { afterAll, describe, expect, it } from 'vitest'
import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'
import { VOTE_SCHEMA_CONFIGS } from '../config-driven/utils/election-schema-config.mts'
import { onGracefulShutdown, read } from '../index.mts'
import { NON_DEFAULT_ID_EXCEPTIONS } from '../schema-growth-classification.mts'
import {
  getConstraintRows,
  getIndexRows,
  getPartitionRows,
} from '../../../test-helpers/data-stores/psql/election-schema.mts'

const electionRelations = entityRelationMetadatum.filter(metadata => metadata.election)
const configuredVoteTables = VOTE_SCHEMA_CONFIGS.map(config => config.voteTable)
const relationVoteTables = electionRelations.map(getEntityRelationVoteTableName)

describe('election schema partitioning', () => {
  afterAll(async () => {
    await onGracefulShutdown()
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
          `idx_${config.voteTable}__${config.entityIdColumn}__uid__id`,
          `idx_${config.voteTable}__${config.entityIdColumn}__id`,
          `idx_${config.voteTable}__uid__${config.entityIdColumn}__id`,
        ]),
      )
      expect(
        tableIndexes.find(
          row => row.index_name === `idx_${config.voteTable}__uid__${config.entityIdColumn}__id`,
        )?.definition,
      ).toContain(`(user_id, ${config.entityIdColumn}, id DESC)`)
    }
  })

  it('uses LIST then target RANGE partitioning for every entity-relation election leaf', async () => {
    const [parentRows, leafRows, constraints, indexes] = await Promise.all([
      getPartitionRows(['entity_relation_votes']),
      getPartitionRows(relationVoteTables),
      getConstraintRows(['entity_relation_votes', ...relationVoteTables]),
      getIndexRows(['entity_relation_votes']),
    ])

    expect(parentRows).toHaveLength(electionRelations.length)
    expect(new Set(parentRows.map(row => row.child_name))).toEqual(new Set(relationVoteTables))
    expect(
      parentRows.every(
        row => row.strategy === 'l' && row.partition_key === 'LIST (relation_table)',
      ),
    ).toBe(true)
    expect(
      constraints
        .filter(row => row.table_name === 'entity_relation_votes' && row.constraint_type === 'p')
        .map(row => row.definition),
    ).toEqual(['PRIMARY KEY (relation_table, entity_relation_id, id)'])
    expect(indexes.map(row => row.index_name)).toEqual(
      expect.arrayContaining([
        'idx_entity_relation_votes__relation__user__id',
        'idx_entity_relation_votes__relation__id',
        'idx_entity_relation_votes__user__relation__id',
      ]),
    )

    for (const metadata of electionRelations) {
      const voteTable = getEntityRelationVoteTableName(metadata)
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
    const { rows: columns } = await read<{
      column_name: string
      data_type: string
      generation_expression: string | null
    }>(
      `/* getUserVouchAggregateColumns */
      SELECT column_name, data_type, generation_expression
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = ANY($1)
      ORDER BY column_name`,
      [
        [
          'votes_count_down',
          'votes_count_none',
          'votes_count_up',
          'votes_score_down',
          'votes_score_net',
          'votes_score_none',
          'votes_score_sort',
          'votes_score_up',
        ],
      ],
    )
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
    const { rows: removed } = await read<{ table_name: string; relation: string | null }>(
      `/* getRemovedElectionTables */
        SELECT table_name, to_regclass('public.' || table_name)::text AS relation
        FROM unnest($1::text[]) AS table_name
        ORDER BY table_name`,
      [removedTables],
    )
    expect(removed).toEqual(
      removedTables.toSorted().map(table_name => ({ table_name, relation: null })),
    )
  })

  it('uses UUIDv7 target keys for routing and derives vote timestamps from vote UUIDv7 IDs', async () => {
    const { rows: columns } = await read<{
      table_name: string
      column_name: string
      data_type: string
      column_default: string | null
      generation_expression: string | null
    }>(
      `/* getElectionUuidV7Columns */
      SELECT table_name, column_name, data_type, column_default, generation_expression
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = ANY($1) AND column_name = 'id')
          OR (table_name = ANY($2) AND column_name = ANY($3))
          OR (table_name = 'entity_relation_votes' AND column_name = 'entity_relation_id')
          OR (table_name = ANY($4) AND column_name = 'created_at'))
      ORDER BY table_name, column_name`,
      [
        [
          ...VOTE_SCHEMA_CONFIGS.map(config => config.entityTable),
          ...electionRelations.map(metadata => metadata.table_name),
        ],
        configuredVoteTables,
        VOTE_SCHEMA_CONFIGS.map(config => config.entityIdColumn),
        [...configuredVoteTables, 'entity_relation_votes'],
      ],
    )

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
    expect(columns).toContainEqual(
      expect.objectContaining({
        table_name: 'entity_relation_votes',
        column_name: 'entity_relation_id',
        data_type: 'uuid',
      }),
    )
    expect(columns).toContainEqual(
      expect.objectContaining({
        table_name: 'entity_relation_votes',
        column_name: 'created_at',
        generation_expression: 'uuid_extract_timestamp(id)',
      }),
    )

    const { rows: samples } = await read<{ target_id: string; target_timestamp: Date }>(
      `/* getUuidV7TargetTimestampEvidence */
        WITH sample AS (SELECT uuidv7() AS target_id)
        SELECT target_id, uuid_extract_timestamp(target_id) AS target_timestamp FROM sample`,
    )
    expect(samples[0]?.target_id).toMatch(/^0[0-9a-f]{7}-[0-9a-f]{4}-7[0-9a-f]{3}-/)
    expect(Math.abs(Date.now() - samples[0]!.target_timestamp.getTime())).toBeLessThan(5_000)
  })
})
