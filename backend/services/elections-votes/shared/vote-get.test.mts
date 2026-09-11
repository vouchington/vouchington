import { describe, expect, it } from 'vitest'
import { mapCurrentVotes } from './vote-get.mts'

describe('mapCurrentVotes', () => {
  it('projects only the public ElectionVote fields', () => {
    const createdAt = new Date('2026-08-10T00:00:00.000Z')

    const votes = mapCurrentVotes(
      {
        entityTable: 'topics',
        voteTable: 'topic_votes',
        entityIdColumn: 'topic_id',
        entityType: 'topic',
        deletedAtFilter: true,
        votePolicy: 'sentiment',
      },
      [
        {
          entity_id: 'topic-id',
          user_id: 'user-id',
          score: 2,
          created_at: createdAt,
          ip_address: '127.0.0.1',
          session_id: 'internal-session',
          vote_policy_entity_field: 'topic',
        },
      ],
    )

    expect(votes).toEqual([
      {
        __entity_type: 'election_vote',
        entity_id: 'topic-id',
        user_id: 'user-id',
        choice: 'vouch',
        created_at: createdAt,
      },
    ])
  })

  it('excludes Clear rows from current vote projections', () => {
    expect(
      mapCurrentVotes(
        {
          entityTable: 'topics',
          voteTable: 'topic_votes',
          entityIdColumn: 'topic_id',
          entityType: 'topic',
          deletedAtFilter: true,
          votePolicy: 'sentiment',
        },
        [{ entity_id: 'topic-id', user_id: 'user-id', score: null, created_at: new Date() }],
      ),
    ).toEqual([])
  })

  it('preserves historic sentiment intent while projecting new semantic votes', () => {
    const config = {
      entityTable: 'topics',
      voteTable: 'topic_votes',
      entityIdColumn: 'topic_id',
      entityType: 'topic',
      deletedAtFilter: true,
      tracksNeutralScore: true,
      tracksSemanticScore: true,
      votePolicy: 'sentiment' as const,
    }
    const createdAt = new Date('2026-08-10T00:00:00.000Z')

    expect(
      mapCurrentVotes(config, [
        {
          entity_id: 'historic-up',
          user_id: 'user-id',
          score: 1,
          score_is_semantic: false,
          created_at: createdAt,
        },
        {
          entity_id: 'semantic-up',
          user_id: 'user-id',
          score: 1,
          score_is_semantic: true,
          created_at: createdAt,
        },
        {
          entity_id: 'historic-down',
          user_id: 'user-id',
          score: -1,
          score_is_semantic: false,
          created_at: createdAt,
        },
        {
          entity_id: 'semantic-down',
          user_id: 'user-id',
          score: -1,
          score_is_semantic: true,
          created_at: createdAt,
        },
      ]),
    ).toMatchObject([
      { entity_id: 'historic-up', choice: 'vouch' },
      { entity_id: 'semantic-up', choice: 'like' },
      { entity_id: 'historic-down', choice: 'disavow' },
      { entity_id: 'semantic-down', choice: 'dislike' },
    ])
  })
})
