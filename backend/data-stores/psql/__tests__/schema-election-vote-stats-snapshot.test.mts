import { describe, expect, it } from 'vitest'
import { read } from '../index.mts'

const ENTITY_TABLES = [
  'users',
  'url_hostnames',
  'topics',
  'posts',
  'rss_feed_items',
  'agent_moderations',
]
const VOTE_TABLES = [
  'user_vouch_votes',
  'hostname_votes',
  'topic_votes',
  'post_votes',
  'rss_feed_item_votes',
  'agent_moderation_votes',
]
const XMAX_COMMENT =
  'Upper transaction-ID boundary of the PostgreSQL snapshot used for the persisted vote-stat aggregate.'
const XIP_COUNT_COMMENT =
  'Number of transactions still in progress in that vote-stat snapshot; lower is newer when the snapshot xmax is equal.'

describe('election vote-stat snapshot schema', () => {
  it('stores paired MVCC snapshot columns and removes vote watermark foreign keys', async () => {
    const [columns, checks, foreignKeys, indexes, retiredColumns] = await Promise.all([
      read<{ table_name: string; column_name: string; type: string; comment: string | null }>(
        `/* getElectionVoteStatsSnapshotColumns */
          SELECT relation.relname AS table_name, attribute.attname AS column_name,
            format_type(attribute.atttypid, attribute.atttypmod) AS type,
            col_description(relation.oid, attribute.attnum) AS comment
          FROM pg_class relation
          JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
          JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
          WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
            AND attribute.attname IN ('votes_snapshot_xmax', 'votes_snapshot_xip_count')
          ORDER BY table_name, column_name`,
        [ENTITY_TABLES],
      ),
      read<{ table_name: string; constraint_name: string; definition: string }>(
        `/* getElectionVoteStatsSnapshotChecks */
          SELECT relation.relname AS table_name, constraint_record.conname AS constraint_name,
            pg_get_constraintdef(constraint_record.oid) AS definition
          FROM pg_constraint constraint_record
          JOIN pg_class relation ON relation.oid = constraint_record.conrelid
          WHERE constraint_record.contype = 'c' AND relation.relname = ANY($1::text[])
            AND pg_get_constraintdef(constraint_record.oid) LIKE '%votes_snapshot_xmax%'
          ORDER BY table_name`,
        [ENTITY_TABLES],
      ),
      read<{ table_name: string; definition: string }>(
        `/* getElectionVoteStatsVoteForeignKeys */
          SELECT relation.relname AS table_name, pg_get_constraintdef(constraint_record.oid) AS definition
          FROM pg_constraint constraint_record
          JOIN pg_class relation ON relation.oid = constraint_record.conrelid
          JOIN pg_class referenced_relation ON referenced_relation.oid = constraint_record.confrelid
          WHERE constraint_record.contype = 'f' AND relation.relname = ANY($1::text[])
            AND referenced_relation.relname = ANY($2::text[])
          ORDER BY table_name, definition`,
        [ENTITY_TABLES, VOTE_TABLES],
      ),
      read<{ indexname: string }>(
        `/* getRetiredElectionVoteStatsIndexes */
          SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = 'idx_agent_moderations__last_vote_id'`,
      ),
      read<{ table_name: string }>(
        `/* getRetiredElectionVoteStatsColumns */
          SELECT table_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ANY($1::text[])
            AND column_name = '_last_vote_id'`,
        [ENTITY_TABLES],
      ),
    ])

    expect(columns.rows).toHaveLength(ENTITY_TABLES.length * 2)
    for (const tableName of ENTITY_TABLES) {
      expect(columns.rows.filter(row => row.table_name === tableName)).toEqual([
        {
          table_name: tableName,
          column_name: 'votes_snapshot_xip_count',
          type: 'integer',
          comment: XIP_COUNT_COMMENT,
        },
        {
          table_name: tableName,
          column_name: 'votes_snapshot_xmax',
          type: 'xid8',
          comment: XMAX_COMMENT,
        },
      ])
      expect(checks.rows.find(row => row.table_name === tableName)).toEqual({
        table_name: tableName,
        constraint_name: `chk_${tableName}_votes_snapshot_complete`,
        definition:
          'CHECK ((((votes_snapshot_xmax IS NULL) AND (votes_snapshot_xip_count IS NULL)) OR ((votes_snapshot_xmax IS NOT NULL) AND (votes_snapshot_xip_count IS NOT NULL) AND (votes_snapshot_xip_count >= 0))))',
      })
    }
    expect(foreignKeys.rows).toEqual([])
    expect(indexes.rows).toEqual([])
    expect(retiredColumns.rows).toEqual([])
  })
})
