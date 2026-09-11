import { describe, expect, it, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  createTestUserDirect,
  insertPostElectionVote,
  insertTestPost,
  insertTestPostVote,
} from '@voucha/test-helpers'
import {
  ELECTION_ENTITY_TABLE_IDENTIFIERS,
  VOTE_ENTITY_ID_COLUMN_IDENTIFIERS,
  VOTE_TABLE_IDENTIFIERS,
} from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import { POST_ELECTION_CONFIG } from '../post/config.mts'
import { getPostElectionVote } from '../post/votes-get.mts'
import { upsertPostElectionVotes } from '../post/votes-upsert.mts'
import { TOPIC_ELECTION_CONFIG } from '../topic/config.mts'
import { HOSTNAME_ELECTION_CONFIG } from '../hostname/config.mts'
import { RSS_FEED_ITEM_ELECTION_CONFIG } from '../rss-feed-item/config.mts'
import { ENTITY_RELATION_ELECTION_CONFIG } from '../entity-relation/config.mts'
import { AGENT_MODERATION_ELECTION_CONFIG } from '../agent-moderation/config.mts'
import { USER_VOUCH_ELECTION_CONFIG } from '../user-vouch/config.mts'
import {
  aggregateElectionVoteStatsFromReplica,
  updateElectionStatsIfChanged,
} from './vote-aggregation.mts'
import type { AggregatedElectionStats } from './types.mts'
import type { PrivateUser } from '@services/users/types'

const ALL_ELECTION_CONFIGS = [
  POST_ELECTION_CONFIG,
  TOPIC_ELECTION_CONFIG,
  HOSTNAME_ELECTION_CONFIG,
  RSS_FEED_ITEM_ELECTION_CONFIG,
  ENTITY_RELATION_ELECTION_CONFIG,
  AGENT_MODERATION_ELECTION_CONFIG,
  USER_VOUCH_ELECTION_CONFIG,
]

const ZERO_STATS: AggregatedElectionStats = {
  votes_score_up: 0,
  votes_score_none: 0,
  votes_score_down: 0,
  votes_count_up: 0,
  votes_count_none: 0,
  votes_count_down: 0,
  snapshot: { xmax: '0', xipCount: 0 },
}

const SAMPLE_UUID = '00000000-0000-7000-8000-000000000000'

describe('vote-aggregation', () => {
  describe('aggregateElectionVoteStatsFromReplica (valid config)', () => {
    let creatorUser: PrivateUser

    beforeAll(async () => {
      creatorUser = await createTestUserDirect({
        username: `test-va-${randomBytes(4).toString('hex')}`,
      })
    }, 60_000)

    it('aggregates current up/down votes for a whitelisted config', async () => {
      const postId = await insertTestPost({
        title: 'Vote aggregation valid config',
        slug: `vote-agg-${randomBytes(6).toString('hex')}`,
        createdById: creatorUser.id,
        markdown: 'test',
      })
      const upvoter = await createTestUserDirect({
        username: `test-va-up-${randomBytes(4).toString('hex')}`,
      })
      const downvoter = await createTestUserDirect({
        username: `test-va-dn-${randomBytes(4).toString('hex')}`,
      })
      await insertTestPostVote(postId, upvoter.id, '1.2.3.4', 1)
      await insertTestPostVote(postId, downvoter.id, '1.2.3.5', -1)

      const stats = await aggregateElectionVoteStatsFromReplica(POST_ELECTION_CONFIG, postId)

      expect(stats.votes_count_up).toBe(1)
      expect(stats.votes_count_down).toBe(1)
      expect(stats.votes_count_none).toBe(0)
    }, 60_000)

    it('keeps historic Vouch strength while leaving topic recommendation support binary', async () => {
      const voter = await createTestUserDirect({
        username: `test-va-provenance-${randomBytes(4).toString('hex')}`,
      })
      const historicPostId = await insertTestPost({
        title: 'Historic Vouch aggregation',
        slug: `historic-vouch-aggregation-${randomBytes(6).toString('hex')}`,
        createdById: creatorUser.id,
        markdown: 'test',
      })
      const recommendationPostId = await insertTestPost({
        title: 'Historic recommendation aggregation',
        slug: `historic-recommendation-aggregation-${randomBytes(6).toString('hex')}`,
        createdById: creatorUser.id,
        markdown: 'test',
        postType: 'topic_recommendation',
      })

      await Promise.all([
        insertPostElectionVote(voter.id, historicPostId, 1),
        insertPostElectionVote(voter.id, recommendationPostId, 1),
      ])

      await expect(getPostElectionVote(voter.id, historicPostId)).resolves.toMatchObject({
        choice: 'vouch',
      })
      await expect(getPostElectionVote(voter.id, recommendationPostId)).resolves.toMatchObject({
        choice: 'support',
      })
      await expect(
        aggregateElectionVoteStatsFromReplica(POST_ELECTION_CONFIG, historicPostId),
      ).resolves.toMatchObject({ votes_score_up: 2, votes_count_up: 1 })
      await expect(
        aggregateElectionVoteStatsFromReplica(POST_ELECTION_CONFIG, recommendationPostId),
      ).resolves.toMatchObject({ votes_score_up: 1, votes_count_up: 1 })
    }, 60_000)

    it('distinguishes legacy Clear zero rows from explicit Neutral rows and appends their transition', async () => {
      const postId = await insertTestPost({
        title: 'Vote zero provenance aggregation',
        slug: `vote-zero-provenance-${randomBytes(6).toString('hex')}`,
        createdById: creatorUser.id,
        markdown: 'test',
      })
      const voter = await createTestUserDirect({
        username: `test-va-zero-${randomBytes(4).toString('hex')}`,
      })

      await insertPostElectionVote(voter.id, postId, 0)
      await expect(getPostElectionVote(voter.id, postId)).resolves.toBeNull()
      await expect(
        aggregateElectionVoteStatsFromReplica(POST_ELECTION_CONFIG, postId),
      ).resolves.toMatchObject({
        votes_count_none: 0,
      })

      await expect(
        upsertPostElectionVotes(voter.id, [{ entityId: postId, score: 0 }]),
      ).resolves.toHaveLength(1)
      await expect(getPostElectionVote(voter.id, postId)).resolves.toMatchObject({
        choice: 'neutral',
      })
      await expect(
        aggregateElectionVoteStatsFromReplica(POST_ELECTION_CONFIG, postId),
      ).resolves.toMatchObject({
        votes_count_none: 1,
      })
      await expect(
        upsertPostElectionVotes(voter.id, [{ entityId: postId, score: 0 }]),
      ).resolves.toEqual([])
    }, 60_000)
  })

  describe('SQL-identifier whitelist coverage', () => {
    it('whitelists every per-entity election config identifier', () => {
      for (const config of ALL_ELECTION_CONFIGS) {
        expect(VOTE_TABLE_IDENTIFIERS.has(config.voteTable)).toBe(true)
        expect(VOTE_ENTITY_ID_COLUMN_IDENTIFIERS.has(config.entityIdColumn)).toBe(true)
      }
      const entityTables = ALL_ELECTION_CONFIGS.map(config => config.entityTable).filter(
        (table): table is string => table !== null,
      )
      for (const entityTable of entityTables) {
        expect(ELECTION_ENTITY_TABLE_IDENTIFIERS.has(entityTable)).toBe(true)
      }
    })
  })

  describe('SQL-identifier whitelist enforcement', () => {
    it('rejects an out-of-whitelist voteTable before querying', async () => {
      await expect(
        aggregateElectionVoteStatsFromReplica(
          { ...POST_ELECTION_CONFIG, voteTable: 'post_votes; DROP TABLE users' },
          SAMPLE_UUID,
        ),
      ).rejects.toThrow('Invalid voteTable: post_votes; DROP TABLE users')
    })

    it('rejects an out-of-whitelist entityIdColumn before querying', async () => {
      await expect(
        aggregateElectionVoteStatsFromReplica(
          { ...POST_ELECTION_CONFIG, entityIdColumn: 'evil_column' },
          SAMPLE_UUID,
        ),
      ).rejects.toThrow('Invalid entityIdColumn: evil_column')
    })

    it('rejects an out-of-whitelist entityTable before writing', async () => {
      await expect(
        updateElectionStatsIfChanged(
          { ...POST_ELECTION_CONFIG, entityTable: 'evil_table' },
          SAMPLE_UUID,
          ZERO_STATS,
        ),
      ).rejects.toThrow('Invalid entityTable: evil_table')
    })
  })
})
