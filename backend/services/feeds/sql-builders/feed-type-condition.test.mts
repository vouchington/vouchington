import { expect, it, describe } from 'vitest'
import { buildFeedTypeCondition } from './feed-type-condition.mts'

describe('feed-type-condition', () => {
  const baseConfig = {
    sourceType: 'users' as const,
    sourceIdColumn: 'posts.created_by_id',
    scoreColumn: 'posts.votes_score_net',
    followedCTEAlias: 'followed_users',
    followedCTEColumn: 'user_id',
    topicsConditions: [],
    minScoreSource: -5,
    minScoreTopics: 0,
    sourceMatchColumn: 'candidate_rows.matches_source',
    topicsMatchColumn: 'candidate_rows.matches_topics',
  }
  const fallbackConfig = {
    ...baseConfig,
    sourceMatchColumn: undefined,
    topicsMatchColumn: undefined,
    topicsConditions: [
      {
        type: 'related_topics' as const,
        tableName: 'post_topics',
        itemIdColumn: 'posts.id',
      },
    ],
  }

  it('buildFeedTypeCondition uses precomputed match columns for any feeds', () => {
    const statement = buildFeedTypeCondition('any', baseConfig)

    expect(statement.text).toContain('candidate_rows.matches_source')
    expect(statement.text).toContain('candidate_rows.matches_topics')
    expect(statement.text).not.toContain('SELECT 1 FROM followed_users')
  })

  it('buildFeedTypeCondition uses precomputed match columns for all feeds', () => {
    const statement = buildFeedTypeCondition('all', baseConfig)

    expect(statement.text).toContain('candidate_rows.matches_source')
    expect(statement.text).toContain('candidate_rows.matches_topics')
    expect(statement.text).toContain('AND candidate_rows.matches_topics')
  })

  it('buildFeedTypeCondition uses precomputed source match column for follow_users feeds', () => {
    const statement = buildFeedTypeCondition('follow_users', baseConfig)

    expect(statement.text).toContain('candidate_rows.matches_source')
    expect(statement.text).not.toContain('candidate_rows.matches_topics')
    expect(statement.text).not.toContain('SELECT 1 FROM followed_users')
  })

  it('buildFeedTypeCondition uses precomputed topics match column for follow_topics feeds', () => {
    const statement = buildFeedTypeCondition('follow_topics', baseConfig)

    expect(statement.text).toContain('candidate_rows.matches_topics')
    expect(statement.text).not.toContain('candidate_rows.matches_source')
    expect(statement.text).not.toContain('SELECT 1 FROM followed_users')
  })

  it('buildFeedTypeCondition uses a source match column even without a topics match column', () => {
    const statement = buildFeedTypeCondition('follow_users', {
      ...baseConfig,
      topicsMatchColumn: undefined,
    })

    expect(statement.text).toContain('candidate_rows.matches_source')
    expect(statement.text).not.toContain('SELECT 1 FROM followed_users')
  })

  it('buildFeedTypeCondition uses a topics match column even without a source match column', () => {
    const statement = buildFeedTypeCondition('follow_topics', {
      ...baseConfig,
      sourceMatchColumn: undefined,
    })

    expect(statement.text).toContain('candidate_rows.matches_topics')
    expect(statement.text).not.toContain('SELECT 1 FROM followed_users')
  })

  it('buildFeedTypeCondition builds fallback source and topics filters', () => {
    const sourceStatement = buildFeedTypeCondition('follow_rss_feeds', fallbackConfig)
    const topicsStatement = buildFeedTypeCondition('follow_topics', fallbackConfig)
    const anyStatement = buildFeedTypeCondition('any', fallbackConfig)
    const allStatement = buildFeedTypeCondition('all', fallbackConfig)

    expect(sourceStatement.text).toContain('SELECT 1 FROM followed_users')
    expect(sourceStatement.text).toContain('posts.votes_score_net >= $1')
    expect(topicsStatement.text).toContain('JOIN followed_topics')
    expect(topicsStatement.text).toContain('post_topics.subject_id = posts.id')
    expect(anyStatement.text).toContain(' OR')
    expect(anyStatement.text).toContain('posts.votes_score_net >= $1')
    expect(allStatement.text).toContain('posts.votes_score_net >= $1')
    expect(allStatement.text).toContain(' AND')
    expect(allStatement.values).toEqual([0])
  })
})
