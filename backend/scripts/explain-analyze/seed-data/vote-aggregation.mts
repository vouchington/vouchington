import { beginTransaction } from '@data-stores/psql'
import {
  createEntityRelationElectionTarget,
  updateEntityRelationElectionVoteStatsFromPrimary,
} from '@services/elections-votes/entity-relation'
import { updateEntityRelationElectionVoteStatsFromPrimaryBatch } from '@services/elections-votes/entity-relation/vote-stats-batch'
import { HOSTNAME_ELECTION_CONFIG } from '@services/elections-votes/hostname'
import { POST_ELECTION_CONFIG } from '@services/elections-votes/post'
import {
  aggregateElectionVoteStatsFromPrimary,
  updateElectionStatsIfChanged,
} from '@services/elections-votes/shared/vote-aggregation'
import { invalidate } from '@services/entity-cache'
import { seedFriendTrustedHostnames } from './friend-trusted-hostnames.mts'
import { seedFreshRelationId, seedRelationIdAfterPost, seedUuid } from './common.mts'

// trending-posts, trending-posts-by-topic, trending-topics, and rss-feed-search-by-publisher-type
// all filter on denormalized votes_score_net columns (posts.votes_score_net, and the election
// relation tables' own votes_score_net). Those columns are only kept in sync by the application's
// real vote-write path — bulk-INSERTing concrete vote ledger rows during seeding never
// touches them, so they stay at their zero default regardless of how many vote rows exist. Rather
// than recomputing every seeded post/relation, recompute only the exact rows those scenarios read:
// post index 0 (already boosted net-positive by seedVotes in votes-and-aliases.mts) and the two
// entity-relation rows seedEntityRelations/seedPublisherTypeRelation created for it.
export async function seedVoteAggregation(): Promise<void> {
  console.log('Recomputing denormalized vote stats for trending/publisher-type scenarios...')

  const seedPostId = seedUuid(0, '05')
  const postCategoryRelationId = seedRelationIdAfterPost(0, 0)
  const publisherTypeRelationId = seedFreshRelationId(0)

  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(
      `/* seedExplainData */ WITH inserted AS (INSERT INTO relation__post__category__topic__votes
         (user_id, subject_id, entity_relation_id, score) VALUES ($1, $2, $3, 1))
       INSERT INTO relation__topic__publisher_type__topic__votes
         (user_id, subject_id, entity_relation_id, score) VALUES ($4, $5, $6, 1)`,
      [
        seedUuid(3, '01'),
        seedPostId,
        postCategoryRelationId,
        seedUuid(4, '01'),
        seedUuid(1, '04'),
        publisherTypeRelationId,
      ],
    )

    await transaction.commit()
  }

  await updateEntityRelationElectionVoteStatsFromPrimary(
    createEntityRelationElectionTarget(postCategoryRelationId, 'relation__post__category__topic'),
  )
  await updateEntityRelationElectionVoteStatsFromPrimary(
    createEntityRelationElectionTarget(
      publisherTypeRelationId,
      'relation__topic__publisher_type__topic',
    ),
  )

  const postStats = await aggregateElectionVoteStatsFromPrimary(POST_ELECTION_CONFIG, seedPostId)
  await updateElectionStatsIfChanged(POST_ELECTION_CONFIG, seedPostId, postStats)
  await invalidate.post_elections(seedPostId)
}

// Preserve a realistic positive-score relation-index population for explain scenarios that inspect
// post-category relations; these votes stay outside the anchor topic's counted relation.
const RELATION_VOTE_DENSITY_COUNT = 2000

export async function seedPostCategoryRelationVoteDensity(): Promise<void> {
  console.log(`Seeding ${RELATION_VOTE_DENSITY_COUNT} additional voted post-category relations...`)

  const relationIds: string[] = []
  const postIds: string[] = []
  const voterIds: string[] = []
  for (let relationIndex = 1; relationIndex <= RELATION_VOTE_DENSITY_COUNT; relationIndex++) {
    relationIds.push(seedRelationIdAfterPost(relationIndex, relationIndex))
    postIds.push(seedUuid(relationIndex, '05'))
    voterIds.push(seedUuid(relationIndex % 20_000, '01'))
  }

  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(
      `/* seedExplainData */ INSERT INTO relation__post__category__topic__votes
         (user_id, subject_id, entity_relation_id, score)
       SELECT voter_id, post_id, relation_id, 1
       FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS t(voter_id, post_id, relation_id)`,
      [voterIds, postIds, relationIds],
    )

    await transaction.commit()
  }

  await updateEntityRelationElectionVoteStatsFromPrimaryBatch(
    relationIds.map(relationId =>
      createEntityRelationElectionTarget(relationId, 'relation__post__category__topic'),
    ),
  )
}

// search-hostnames-trust(-by-topic), friend-trusted-hostnames, and url-hostname-search-by-topic all
// need a real hostname tagged with seedTopicId and carrying a non-zero denormalized vote count —
// seedHostnames never sets topic_id or votes. The voter is user index 1, whom seedUser (index 0)
// already follows via seedFollowRelations, satisfying getFriendTrustedHostnames' "friend" join too.
export async function seedHostnameVoteAggregation(): Promise<void> {
  console.log('Seeding a topic-tagged, voted hostname for hostname search scenarios...')

  const hostnameId = seedUuid(0, '02')
  const topicId = seedUuid(0, '04')
  const voterId = seedUuid(1, '01')

  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(`/* seedExplainData */ UPDATE url_hostnames SET topic_id = $1 WHERE id = $2`, [
      topicId,
      hostnameId,
    ])
    await query(
      `/* seedExplainData */ INSERT INTO hostname_votes (hostname_id, user_id, score)
       VALUES ($1, $2, 1) ON CONFLICT DO NOTHING`,
      [hostnameId, voterId],
    )

    await transaction.commit()
  }

  const hostnameStats = await aggregateElectionVoteStatsFromPrimary(
    HOSTNAME_ELECTION_CONFIG,
    hostnameId,
  )
  await updateElectionStatsIfChanged(HOSTNAME_ELECTION_CONFIG, hostnameId, hostnameStats)
  await invalidate.hostname_elections(hostnameId)
  // The friend-trusted scenario's viewer follows 10k users with long hostname ballot histories.
  await seedFriendTrustedHostnames()
}
