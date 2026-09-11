import { describe, expect, it } from 'vitest'
import {
  createTestAgent,
  createTestUser,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  insertTestPost,
  insertTestRssFeedDirect,
  insertTestRssFeedItem,
  insertTestTopic,
  insertTestUrlHostname,
  insertPostElectionVote,
  insertRssFeedItemVote,
  insertTopicElectionVote,
  insertUserVouchElectionVote,
  upsertHostnameVote,
} from '@voucha/test-helpers'
import { v7 as uuidv7 } from 'uuid'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { upsertEntityRelationElectionVotes } from '@services/elections-votes/entity-relation'
import { upsertAgentModerationElectionVotes } from '@services/elections-votes/agent-moderation'
import { getUserTagTopics } from '@services/topics/user-tag-topics'
import { streamVotes } from '@services/account-data-requests/stream'

describe('account-data vote export', () => {
  it('exports legacy binary zero relation and moderation votes as Clear', async () => {
    const voter = await createTestUser()
    const target = await createTestUser()
    const [tag] = await getUserTagTopics()
    const relationMetadata = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'category',
      objectType: 'topic',
    })
    const [relation] = await upsertEntityRelation(voter, relationMetadata, target, [tag!])
    if (!relation?.id) throw new Error('Expected user-tag relation')
    const agent = await createTestAgent({ agentType: 'moderator', activated: true })
    const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
    const postId = await insertTestPost({
      title: `Legacy moderation export ${crypto.randomUUID()}`,
      slug: `legacy-moderation-export-${crypto.randomUUID()}`,
      createdById: voter.id,
      markdown: 'Legacy binary vote export fixture.',
    })
    const moderationId = await insertTestAgentModeration({
      postId,
      promptId,
      agentId: agent.id,
      flagged: false,
      results: { flagged: false, reason: 'Legacy binary vote export fixture.' },
    })

    await upsertEntityRelationElectionVotes(
      voter.id,
      [{ entityId: relation.id, score: 0 }],
      undefined,
      relationMetadata,
    )
    await upsertAgentModerationElectionVotes(voter.id, [{ entityId: moderationId, score: 0 }])

    const votes = await collectRows(streamVotes(voter.id))

    expect(votes).toContainEqual(
      expect.objectContaining({
        entity_type: 'entity_relation',
        entity_id: relation.id,
        choice: 'clear',
      }),
    )
    expect(votes).toContainEqual(
      expect.objectContaining({
        entity_type: 'agent_moderation',
        entity_id: moderationId,
        choice: 'clear',
      }),
    )
  })

  it('exports legacy Clear zero history and explicit Neutral zero history', async () => {
    const voter = await createTestUser()
    const target = await createTestUser()
    const random = crypto.randomUUID()
    const postId = await insertTestPost({
      title: `Sentiment export ${random}`,
      slug: `sentiment-export-${random}`,
      createdById: voter.id,
      markdown: 'Sentiment export history fixture.',
    })
    const topicId = await insertTestTopic({
      name: `Sentiment export ${random}`,
      slug: `sentiment-export-topic-${random}`,
      createdById: voter.id,
    })
    const nullClearTopicId = await insertTestTopic({
      name: `Sentiment null Clear export ${random}`,
      slug: `sentiment-null-clear-export-topic-${random}`,
      createdById: voter.id,
    })
    const hostnameId = await insertTestUrlHostname({ hostname: `sentiment-${random}.example.com` })
    const rssFeed = await insertTestRssFeedDirect({})
    const rssFeedItemId = await insertTestRssFeedItem({
      rssFeedId: rssFeed.id,
      urlId: rssFeed.rss_feed_url_id,
      guid: `sentiment-export-${random}`,
      itemData: { title: 'Sentiment export history fixture.' },
      contentSha256: Buffer.alloc(32),
    })
    const oldVoteId = uuidv7({ msecs: Date.UTC(2020, 0, 1), seq: 0 })

    await Promise.all([
      insertPostElectionVote(voter.id, postId, 0, oldVoteId),
      insertTopicElectionVote(voter.id, topicId, 0, oldVoteId),
      upsertHostnameVote(hostnameId, voter.id, 0, oldVoteId),
      insertRssFeedItemVote(voter.id, rssFeedItemId, 0, oldVoteId),
      insertUserVouchElectionVote(voter.id, target.id, 0, oldVoteId),
    ])
    await Promise.all([
      insertPostElectionVote(voter.id, postId, 0, undefined, true),
      insertTopicElectionVote(voter.id, topicId, 0, undefined, true),
      upsertHostnameVote(hostnameId, voter.id, 0, undefined, true),
      insertRssFeedItemVote(voter.id, rssFeedItemId, 0, undefined, true),
      insertUserVouchElectionVote(voter.id, target.id, 0, undefined, true),
    ])
    await insertTopicElectionVote(voter.id, nullClearTopicId, null)

    const votes = await collectRows(streamVotes(voter.id))
    expectSentimentVoteHistory(votes, [
      ['post', postId],
      ['topic', topicId],
      ['hostname', hostnameId],
      ['rss_feed_item', rssFeedItemId],
      ['user_vouch', target.id],
    ])
    expect(votes).toContainEqual(
      expect.objectContaining({
        entity_type: 'topic',
        entity_id: nullClearTopicId,
        choice: 'clear',
      }),
    )
  })

  it('preserves historic Vouch and Disavow intent alongside semantic Like and Dislike', async () => {
    const voter = await createTestUser()
    const target = await createTestUser()
    const random = crypto.randomUUID()
    const postId = await insertTestPost({
      title: `Semantic provenance export ${random}`,
      slug: `semantic-provenance-export-${random}`,
      createdById: voter.id,
      markdown: 'Semantic provenance export fixture.',
    })
    const recommendationPostId = await insertTestPost({
      title: `Recommendation provenance export ${random}`,
      slug: `recommendation-provenance-export-${random}`,
      createdById: voter.id,
      markdown: 'Recommendation provenance export fixture.',
      postType: 'topic_recommendation',
    })
    const semanticVouchPostId = await insertTestPost({
      title: `Semantic Vouch export ${random}`,
      slug: `semantic-vouch-export-${random}`,
      createdById: voter.id,
      markdown: 'Semantic Vouch export fixture.',
    })
    const topicId = await insertTestTopic({
      name: `Semantic provenance export ${random}`,
      slug: `semantic-provenance-export-topic-${random}`,
      createdById: voter.id,
    })
    const hostnameId = await insertTestUrlHostname({ hostname: `semantic-${random}.example.com` })
    const rssFeed = await insertTestRssFeedDirect({})
    const rssFeedItemId = await insertTestRssFeedItem({
      rssFeedId: rssFeed.id,
      urlId: rssFeed.rss_feed_url_id,
      guid: `semantic-provenance-export-${random}`,
      itemData: { title: 'Semantic provenance export fixture.' },
      contentSha256: Buffer.alloc(32),
    })

    await Promise.all([
      insertPostElectionVote(voter.id, postId, 1),
      insertPostElectionVote(voter.id, recommendationPostId, 1),
      insertPostElectionVote(voter.id, semanticVouchPostId, 2, undefined, false, true),
      insertTopicElectionVote(voter.id, topicId, 1, undefined, false, true),
      upsertHostnameVote(hostnameId, voter.id, -1),
      insertRssFeedItemVote(voter.id, rssFeedItemId, -1, undefined, false, true),
      insertUserVouchElectionVote(voter.id, target.id, 1),
    ])
    await Promise.all([
      insertPostElectionVote(voter.id, postId, 2),
      insertTopicElectionVote(voter.id, topicId, 2),
      upsertHostnameVote(hostnameId, voter.id, -2),
      insertRssFeedItemVote(voter.id, rssFeedItemId, -2),
      insertUserVouchElectionVote(voter.id, target.id, 2),
    ])

    const votes = await collectRows(streamVotes(voter.id))
    expect(votes).toContainEqual(
      expect.objectContaining({ entity_type: 'post', entity_id: postId, choice: 'vouch' }),
    )
    expect(votes).toContainEqual(
      expect.objectContaining({
        entity_type: 'post',
        entity_id: semanticVouchPostId,
        choice: 'vouch',
      }),
    )
    expect(votes).toContainEqual(
      expect.objectContaining({
        entity_type: 'post',
        entity_id: recommendationPostId,
        choice: 'support',
      }),
    )
    expect(votes).toContainEqual(
      expect.objectContaining({ entity_type: 'topic', entity_id: topicId, choice: 'like' }),
    )
    expect(votes).toContainEqual(
      expect.objectContaining({
        entity_type: 'hostname',
        entity_id: hostnameId,
        choice: 'disavow',
      }),
    )
    expect(votes).toContainEqual(
      expect.objectContaining({
        entity_type: 'rss_feed_item',
        entity_id: rssFeedItemId,
        choice: 'dislike',
      }),
    )
    expect(votes).toContainEqual(
      expect.objectContaining({ entity_type: 'user_vouch', entity_id: target.id, choice: 'vouch' }),
    )
    for (const [entityType, entityId] of [
      ['post', postId],
      ['topic', topicId],
      ['hostname', hostnameId],
      ['rss_feed_item', rssFeedItemId],
      ['user_vouch', target.id],
    ]) {
      expect(
        votes.filter(vote => vote.entity_type === entityType && vote.entity_id === entityId),
      ).toHaveLength(1)
    }
  })
})

async function collectRows(rows: AsyncGenerator<Record<string, unknown>>) {
  const collected: Record<string, unknown>[] = []
  for await (const row of rows) collected.push(row)
  return collected
}

function expectSentimentVoteHistory(
  votes: Record<string, unknown>[],
  entities: Array<[entityType: string, entityId: string]>,
) {
  for (const [entityType, entityId] of entities) {
    expect(
      votes
        .filter(vote => vote.entity_type === entityType && vote.entity_id === entityId)
        .map(vote => vote.choice),
    ).toEqual(['clear', 'neutral'])
  }
}
