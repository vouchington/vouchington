import { describe, expect, it } from 'vitest'
import { ELECTION_VOTE_POLICY_SCORES } from '@voucha/types/entities/election'
import idempotent from '../0000-00-00-entity-elections.mts'
import generateEntityRelationsSql from '../0000-00-01-entity-relations.mts'
import generateRelationIndexesSql from '../0000-00-01b-entity-relation-indexes.mts'
import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'
import { getElectionForeignKeyName } from '../utils/election-sql-identifiers.mts'
import { VOTE_SCHEMA_CONFIGS } from '../utils/election-schema-config.mts'

describe('0000-00-00-entity-elections', () => {
  it('keeps every generated declaration within PostgreSQL identifier length without collisions', () => {
    const generated = [
      idempotent(),
      generateEntityRelationsSql(),
      generateRelationIndexesSql(),
    ].join('\n')
    const declarations = [
      ...generated.matchAll(
        /(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:UNIQUE\s+)?(?:TABLE|INDEX|TYPE|VIEW|TRIGGER|FUNCTION)\s+(?:IF\s+NOT\s+EXISTS\s+)?|CONSTRAINT\s+)("[^"\n]+"|[a-z_][a-z_0-9]*)/gi,
      ),
    ]
    expect(declarations.length).toBeGreaterThan(100)
    const names = declarations.map(match => match[1]!.replaceAll('"', ''))
    for (const name of names) expect(Buffer.byteLength(name)).toBeLessThanOrEqual(63)
    const indexes = [
      ...generated.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+([a-z_0-9]+)/gi),
    ].map(match => match[1])
    expect(new Set(indexes).size).toBe(indexes.length)
  })

  it('names concrete vote composite foreign keys explicitly and uniquely', () => {
    const sql = generateEntityRelationsSql()
    const names = entityRelationMetadatum
      .filter(metadata => metadata.election)
      .map(metadata => {
        const table = getEntityRelationVoteTableName(metadata)
        const name = getElectionForeignKeyName(table, 'subject_entity_relation')
        expect(Buffer.byteLength(name)).toBeLessThanOrEqual(63)
        expect(sql).toContain(`CONSTRAINT ${name} FOREIGN KEY (subject_id, entity_relation_id)`)
        return name
      })
    expect(new Set(names).size).toBe(names.length)
    expect(getElectionForeignKeyName('post_votes', 'subject_entity_relation')).toBe(
      'fk_post_votes__subject_entity_relation',
    )
    expect(() => getElectionForeignKeyName('abc', 'x'.repeat(64))).toThrow('cannot fit')
  })

  it('stores the current outbound ActivityPub Like generation on post vote events', () => {
    const sql = idempotent()

    expect(sql).toContain('outbound_ap_like_activity_id UUID')
    expect(sql).not.toContain('ADD COLUMN outbound_ap_like_activity_id')
  })

  it('builds current indexes without repairing entity or vote tables', () => {
    const sql = idempotent()

    expect(sql).not.toContain('ALTER TABLE')
    expect(sql).not.toContain('ADD COLUMN')
    expect(sql).not.toContain('pg_attribute')
    expect(sql).not.toContain('election_vote_migration_claims')
    expect(sql).not.toContain('user_bot_elections')
    expect(sql).not.toContain('user_vouch_elections')
    expect(sql).toContain('idx_posts__votes_score_sort__id')
    expect(sql).toContain('CONSTRAINT chk_post_votes_score_domain')
  })

  it('should generate vote tables for each entity type', () => {
    const sql = idempotent()

    for (const config of VOTE_SCHEMA_CONFIGS) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${config.voteTable}`)
    }
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS entity_relation_votes')
    expect(sql).not.toContain('user_bot_votes')
    expect(sql).toContain('device_id UUID')
    expect(sql).toContain('session_id UUID')
  })

  it('keeps the binary moderation vote domain', () => {
    const sql = idempotent()

    expect(sql).not.toContain('UPDATE agent_moderation_votes SET score = NULL')
    expect(sql).toContain('CHECK (score IS NULL OR score IN (-1, 0, 1))')
  })

  it('creates semantic provenance on every sentiment vote table', () => {
    const sql = idempotent()
    const sentimentVoteTables = VOTE_SCHEMA_CONFIGS.filter(config => config.tracksSemanticScore)

    expect(sentimentVoteTables).toHaveLength(5)
    for (const config of sentimentVoteTables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${config.voteTable}`)
      expect(sql).toContain('score_is_semantic BOOLEAN NOT NULL DEFAULT FALSE')
      expect(sql).not.toContain('ADD COLUMN score_is_semantic')
      expect(sql).toContain(`chk_${config.voteTable}_score_is_semantic`)
    }
  })

  it('covers every public semantic score in the generated table-domain checks', () => {
    const electionSql = idempotent()
    const relationSql = generateEntityRelationsSql()
    const sentimentVoteTables = VOTE_SCHEMA_CONFIGS.filter(
      config => config.entityType !== 'agent_moderation',
    )

    for (const config of sentimentVoteTables) {
      assertScoresAllowed(electionSql, config.voteTable, ELECTION_VOTE_POLICY_SCORES.sentiment)
    }
    assertScoresAllowed(electionSql, 'post_votes', ELECTION_VOTE_POLICY_SCORES.recommendation)
    assertScoresAllowed(
      electionSql,
      'agent_moderation_votes',
      ELECTION_VOTE_POLICY_SCORES.moderation,
    )
    for (const metadata of entityRelationMetadatum.filter(item => item.election))
      assertScoresAllowed(
        relationSql,
        getEntityRelationVoteTableName(metadata),
        ELECTION_VOTE_POLICY_SCORES.relation,
      )
  })

  it('range-partitions each vote table by its target UUIDv7 with one default partition', () => {
    const sql = idempotent()

    expect(sql).not.toContain('PARTITION BY HASH')
    for (const config of VOTE_SCHEMA_CONFIGS) {
      expect(sql).toContain(`PRIMARY KEY (${config.entityIdColumn}, id)`)
      expect(sql).toContain(`) PARTITION BY RANGE (${config.entityIdColumn});`)
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${config.voteTable}__default`)
      expect(sql).toContain(`PARTITION OF ${config.voteTable} DEFAULT`)
    }
  })

  it('should create all target and voter lookup indexes for every vote table', () => {
    const sql = idempotent()

    for (const config of VOTE_SCHEMA_CONFIGS) {
      const { voteTable, entityIdColumn } = config
      expect(sql).toContain(`idx_${voteTable}__${entityIdColumn}__uid__id`)
      expect(sql).toContain(`(${entityIdColumn}, user_id, id DESC)`)
      expect(sql).toContain(`idx_${voteTable}__${entityIdColumn}__id`)
      expect(sql).toContain(`(${entityIdColumn}, id)`)
      expect(sql).toContain(`idx_${voteTable}__uid__${entityIdColumn}__id`)
      expect(sql).toContain(`(user_id, ${entityIdColumn}, id DESC)`)
    }
  })

  it('creates required additional vote columns directly', () => {
    const sql = idempotent()

    expect(sql).toContain('post_id UUID NOT NULL,')
    expect(sql).toContain('agent_moderation_id UUID NOT NULL,')
    expect(sql).not.toContain('ADD COLUMN')
  })

  it('excludes soft-deleted rows from votes_score_sort indexes exactly where deletedAtFilter is set', () => {
    const sql = idempotent()

    for (const config of VOTE_SCHEMA_CONFIGS) {
      const table = config.entityTable
      if (!table) continue
      const sortCols = (config.entitySortColumns ?? config.entityKeyColumns).join(', ')

      expect(sql).toContain(
        `CREATE INDEX IF NOT EXISTS idx_${table}__votes_score_sort__id\nON ${table} (votes_score_sort DESC, ${sortCols})${config.deletedAtFilter ? '\nWHERE deleted_at IS NULL' : ''};`,
      )
      expect(sql).toContain(
        `CREATE INDEX IF NOT EXISTS idx_${table}__votes_score_sort__pos__id\nON ${table} (votes_score_sort DESC, ${sortCols})\nWHERE votes_score_net > 0${config.deletedAtFilter ? ' AND deleted_at IS NULL' : ''};`,
      )
    }

    // user_vouch (target table: users) must carry the filter, since `users` has deleted_at.
    const userVouchConfig = VOTE_SCHEMA_CONFIGS.find(config => config.entityType === 'user_vouch')
    expect(userVouchConfig?.deletedAtFilter).toBe(true)
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_users__votes_score_sort__id\nON users (votes_score_sort DESC, id)\nWHERE deleted_at IS NULL;',
    )
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_users__votes_score_sort__pos__id\nON users (votes_score_sort DESC, id)\nWHERE votes_score_net > 0 AND deleted_at IS NULL;',
    )

    // url_hostnames has no deleted_at column and must not gain the filter.
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_url_hostnames__votes_score_sort__pos__id\nON url_hostnames (votes_score_sort DESC, id)\nWHERE votes_score_net > 0;',
    )
    expect(sql).not.toContain(
      'idx_url_hostnames__votes_score_sort__id\nON url_hostnames (votes_score_sort DESC, id)\nWHERE deleted_at IS NULL',
    )
  })

  it('should not reference old election tables', () => {
    const sql = idempotent()

    expect(sql).not.toContain('post_elections')
    expect(sql).not.toContain('topic_elections')
    expect(sql).not.toContain('entity_relation_elections')
    expect(sql).not.toContain('user_bot_elections')
    expect(sql).not.toContain('user_bot_votes')
    expect(sql).not.toContain('election_id')
  })
})

function assertScoresAllowed(schema: string, table: string, scores: Record<string, number>): void {
  const tableStart = schema.indexOf(`CREATE TABLE IF NOT EXISTS ${table}`)
  expect(tableStart).toBeGreaterThanOrEqual(0)
  const nextTableStart = schema.indexOf('CREATE TABLE IF NOT EXISTS', tableStart + 1)
  const tableSql = schema.slice(tableStart, nextTableStart === -1 ? undefined : nextTableStart)
  for (const score of Object.values(scores)) {
    const isInSentimentRange = tableSql.includes('CHECK (score IS NULL OR score BETWEEN -2 AND 2)')
    const isInBinaryDomain =
      tableSql.includes('CHECK (score IS NULL OR score IN (-1, 0, 1))') &&
      (score === -1 || score === 1)
    expect(isInSentimentRange || isInBinaryDomain).toBe(true)
  }
}
