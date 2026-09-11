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
import { seedFreshRelationId, seedRelationIdAfterPost, seedUuid } from './common.mts'

// trending-posts, trending-posts-by-topic, trending-topics, and rss-feed-search-by-publisher-type
// all filter on denormalized votes_score_net columns (posts.votes_score_net, and the election
// relation tables' own votes_score_net). Those columns are only kept in sync by the application's
// real vote-write path — bulk-INSERTing post_votes/entity_relation_votes rows during seeding never
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
      `/* seedExplainData */ INSERT INTO entity_relation_votes
         (relation_table, user_id, subject_id, entity_relation_id, score)
       VALUES
         ('relation__post__category__topic', $1, $2, $3, 1),
         ('relation__topic__publisher_type__topic', $4, $5, $6, 1)`,
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

// getTopicViewerCounts (the topic-viewer-counts EXPLAIN scenario) binds a single topic's candidate
// posts through relation__post__category__topic.object_id, and its plan gate
// (plan-topic-viewer-counts-gate.mts) requires the planner resolve that through
// idx_relation__post__category__topic__reverse_index (object_id, subject_id). But
// seedVoteAggregation above only ever votes on ONE of the 50,000 relations seedEntityRelations
// inserted (post 0 / topic 0), leaving idx_relation__post__category__topic__votes_score_sort__pos__id
// (votes_score_sort DESC, id) WHERE votes_score_net > 0 with exactly one row -- trivially cheap for
// the planner to scan regardless of how poorly it matches object_id, so it wins over reverse_index
// on cost. Voting on a wide spread of OTHER topics' relations (never topic 0, whose relation is the
// one getTopicViewerCounts's discussions:1 assertion counts) restores that partial index to a
// realistic size so the planner's normal cost model prefers the targeted reverse_index lookup.
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
      `/* seedExplainData */ INSERT INTO entity_relation_votes
         (relation_table, user_id, subject_id, entity_relation_id, score)
       SELECT 'relation__post__category__topic', voter_id, post_id, relation_id, 1
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

// search-top-hostnames(-by-topic), friend-trusted-hostnames, and url-hostname-search-by-topic all
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
}

// posts-by-url-ids and rss-feed-item-feed-related-posts both read relation__post__related__url
// rows with votes_score_net > 0. No seeded post is ever post_type='link', so getPostIdsByUrlIds'
// link_posts fallback path is unreachable — the only viable fixture is a real, voted relation row
// per url. Use fresh, otherwise-unused post indices as the relation subjects.
export async function seedRelatedUrlPostRelations(): Promise<void> {
  console.log('Seeding voted post->url relations for url/feed related-post scenarios...')

  const relations = [
    { postIndex: 20, relationIndex: 0, urlId: seedUuid(0, '03') },
    { postIndex: 21, relationIndex: 1, urlId: seedUuid(2500, '03') },
  ] as const

  const voterId = seedUuid(2, '01')

  {
    await using transaction = await beginTransaction()
    const query = transaction
    for (const { postIndex, relationIndex, urlId } of relations) {
      const relationId = seedRelationIdAfterPost(postIndex, relationIndex)
      await query(
        `/* seedExplainData */ INSERT INTO relation__post__related__url (id, subject_id, object_id, created_by_id)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [relationId, seedUuid(postIndex, '05'), urlId, voterId],
      )
      await query(
        `/* seedExplainData */ INSERT INTO entity_relation_votes
           (relation_table, user_id, subject_id, entity_relation_id, score)
         VALUES ('relation__post__related__url', $1, $2, $3, 1)`,
        [voterId, seedUuid(postIndex, '05'), relationId],
      )
    }

    await transaction.commit()
  }

  for (const { postIndex, relationIndex } of relations) {
    const relationId = seedRelationIdAfterPost(postIndex, relationIndex)
    await updateEntityRelationElectionVoteStatsFromPrimary(
      createEntityRelationElectionTarget(relationId, 'relation__post__related__url'),
    )
  }
}
