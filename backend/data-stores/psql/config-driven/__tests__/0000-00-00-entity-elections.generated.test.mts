import { describe, expect, it } from 'vitest'
import { ELECTION_VOTE_POLICY_SCORES } from '@voucha/types/entities/election'
import idempotent from '../0000-00-00-entity-elections.mts'
import generateEntityRelationsSql from '../0000-00-01-entity-relations.mts'
import {
  buildVoteTableConstraintName,
  buildVoteTableConstraintReferencedTable,
} from '../utils/catalog-guarded-ddl.mts'
import { VOTE_SCHEMA_CONFIGS } from '../utils/election-schema-config.mts'

describe('0000-00-00-entity-elections', () => {
  it('stores the current outbound ActivityPub Like generation on post vote events', () => {
    const sql = idempotent()

    expect(sql).toContain('outbound_ap_like_activity_id UUID')
    expect(sql).toContain('ADD COLUMN outbound_ap_like_activity_id UUID;')
  })

  it('should generate catalog-guarded repair SQL for each entity table', () => {
    const sql = idempotent()

    expect(sql).toContain('ALTER TABLE posts')
    expect(sql).toContain('ALTER TABLE topics')
    expect(sql).toContain('ALTER TABLE url_hostnames')
    expect(sql).toContain('ALTER TABLE rss_feed_items')
    expect(sql).toContain('ALTER TABLE agent_moderations')
    expect(sql).toContain('ALTER TABLE users')
    expect(sql).not.toContain('user_bot_elections')
    expect(sql).not.toContain('user_vouch_elections')

    expect(sql).toContain('DO $$ BEGIN')
    expect(sql).toContain(
      "IF NOT EXISTS (\n    SELECT 1\n    FROM pg_attribute\n    WHERE attrelid = 'posts'::regclass",
    )
    expect(sql).toContain(
      "  ) THEN\n    LOCK TABLE posts IN SHARE ROW EXCLUSIVE MODE;\n    IF NOT EXISTS (\n      SELECT 1\n      FROM pg_attribute\n      WHERE attrelid = 'posts'::regclass",
    )
    expect(sql).toContain('FROM pg_attribute')
    expect(sql).toContain('ADD COLUMN votes_score_up DOUBLE PRECISION NOT NULL DEFAULT 0')
    expect(sql).toContain('ADD COLUMN votes_score_net DOUBLE PRECISION GENERATED ALWAYS AS')
    expect(sql).toContain('CHECK (votes_score_up >= 0) NOT VALID')
    expect(sql).toContain('VALIDATE CONSTRAINT chk_posts_votes_score_up')
    expect(sql).toContain('ADD CONSTRAINT post_votes_user_agent_id_fkey')
    expect(sql).toContain(
      "IF NOT EXISTS (\n    SELECT 1\n    FROM pg_constraint\n    WHERE conname = 'post_votes_user_agent_id_fkey'",
    )
    expect(sql).toContain(
      "  ) THEN\n    LOCK TABLE vote_user_agents IN SHARE ROW EXCLUSIVE MODE;\n    LOCK TABLE post_votes IN SHARE ROW EXCLUSIVE MODE;\n    IF NOT EXISTS (\n      SELECT 1\n      FROM pg_constraint\n      WHERE conname = 'post_votes_user_agent_id_fkey'",
    )
    expect(sql).toContain(
      'LOCK TABLE agent_moderations IN SHARE ROW EXCLUSIVE MODE;\n    LOCK TABLE agent_moderation_votes IN SHARE ROW EXCLUSIVE MODE;',
    )
    expect(sql).toContain(
      'FOREIGN KEY (user_agent_id) REFERENCES vote_user_agents ON DELETE SET NULL NOT VALID',
    )
    expect(sql).toContain('VALIDATE CONSTRAINT post_votes_user_agent_id_fkey')
    expect(sql).not.toContain(
      'LOCK TABLE vote_user_agents IN SHARE ROW EXCLUSIVE MODE;\n    ALTER TABLE post_votes\n      VALIDATE CONSTRAINT post_votes_user_agent_id_fkey;',
    )
    expect(sql).not.toContain('ADD COLUMN IF NOT EXISTS')
    expect(sql).toContain('fn_wilson_score_lower_bound')
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

  it('preserves historic binary-policy Neutral audit rows without rewriting them', () => {
    const sql = idempotent()

    expect(sql).not.toContain('UPDATE agent_moderation_votes SET score = NULL')
    expect(sql).toContain('CHECK (score IS NULL OR score IN (-1, 0, 1))')
  })

  it('adds old-writer-safe semantic provenance to every sentiment vote table', () => {
    const sql = idempotent()
    const sentimentVoteTables = VOTE_SCHEMA_CONFIGS.filter(config => config.tracksSemanticScore)

    expect(sentimentVoteTables).toHaveLength(5)
    for (const config of sentimentVoteTables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${config.voteTable}`)
      expect(sql).toContain('score_is_semantic BOOLEAN NOT NULL DEFAULT FALSE')
      expect(sql).toContain(`ADD COLUMN score_is_semantic BOOLEAN NOT NULL DEFAULT FALSE;`)
      expect(sql).toContain(`chk_${config.voteTable}_score_is_semantic`)
    }
  })

  it('marks appended legacy sentiment repairs as non-semantic', () => {
    const sql = idempotent()

    expect(sql).toContain(
      'INSERT INTO post_votes (id, user_id, post_id, score, score_is_semantic, outbound_ap_like_activity_id)',
    )
    expect(sql).toContain(
      "uuidv7(uuid_extract_timestamp(current_votes.id) + INTERVAL '1 millisecond' - clock_timestamp())",
    )
    expect(sql).toContain('CASE current_votes.score WHEN 1 THEN 2 ELSE -2 END, FALSE')
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
    assertScoresAllowed(relationSql, 'entity_relation_votes', ELECTION_VOTE_POLICY_SCORES.relation)
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

  it('should keep additional vote column repairs nullable for existing rows', () => {
    const sql = idempotent()

    expect(sql).toContain('post_id UUID NOT NULL,')
    expect(sql).toContain('agent_moderation_id UUID NOT NULL,')
    expect(sql).toContain('ADD COLUMN post_id UUID;')
    expect(sql).toContain('ADD COLUMN agent_moderation_id UUID;')
  })

  it('should derive vote constraint names across foreign key spacing variants', () => {
    expect(
      buildVoteTableConstraintName('post_votes', 'FOREIGN KEY(post_id) REFERENCES posts'),
    ).toBe('post_votes_post_id_fkey')
    expect(
      buildVoteTableConstraintName(
        'post_votes',
        'FOREIGN   KEY  (post_id, user_id) REFERENCES posts',
      ),
    ).toBe('post_votes_post_id_user_id_fkey')
    expect(
      buildVoteTableConstraintReferencedTable(
        'post_votes',
        'FOREIGN KEY ("post_id") REFERENCES "posts"',
      ),
    ).toBe('posts')
    expect(() => buildVoteTableConstraintName('post_votes', 'CHECK (score >= 0)')).toThrow(
      'unsupported vote table constraint for post_votes',
    )
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
