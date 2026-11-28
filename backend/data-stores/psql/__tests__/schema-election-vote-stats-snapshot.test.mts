import { describe, expect, it } from 'vitest'
import { readPublicIndexDefinitions } from '../../../test-helpers/data-stores/psql/schema-catalog.mts'
import {
  getElectionVoteStatsSnapshotChecks,
  getElectionVoteStatsSnapshotColumns,
  getElectionVoteStatsVoteForeignKeys,
  getRetiredElectionVoteStatsColumns,
} from '../../../test-helpers/data-stores/psql/schema-election-vote-stats-snapshot.mts'

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
      getElectionVoteStatsSnapshotColumns(ENTITY_TABLES),
      getElectionVoteStatsSnapshotChecks(ENTITY_TABLES),
      getElectionVoteStatsVoteForeignKeys(ENTITY_TABLES, VOTE_TABLES),
      readPublicIndexDefinitions(['idx_agent_moderations__last_vote_id']),
      getRetiredElectionVoteStatsColumns(ENTITY_TABLES),
    ])

    expect(columns).toHaveLength(ENTITY_TABLES.length * 2)
    for (const tableName of ENTITY_TABLES) {
      expect(columns.filter(row => row.table_name === tableName)).toEqual([
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
      expect(checks.find(row => row.table_name === tableName)).toEqual({
        table_name: tableName,
        constraint_name: `chk_${tableName}_votes_snapshot_complete`,
        definition:
          'CHECK ((((votes_snapshot_xmax IS NULL) AND (votes_snapshot_xip_count IS NULL)) OR ((votes_snapshot_xmax IS NOT NULL) AND (votes_snapshot_xip_count IS NOT NULL) AND (votes_snapshot_xip_count >= 0))))',
      })
    }
    expect(foreignKeys).toEqual([])
    expect(indexes).toEqual([])
    expect(retiredColumns).toEqual([])
  })
})
