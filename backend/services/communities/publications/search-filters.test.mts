import { describe, expect, it } from 'vitest'
import { createUniversalTopicFiltersBaseQueryForTest } from '@voucha/test-helpers'
import { appendHashtagFilters, appendUniversalTopicFilters } from './search-filters.mts'

describe('appendUniversalTopicFilters', () => {
  it('does not filter when no topic ids are provided', () => {
    const query = createUniversalTopicFiltersBaseQueryForTest()
    const original = { text: query.text, values: [...query.values] }

    appendUniversalTopicFilters(query, [])

    expect(query.text).toBe(original.text)
    expect(query.values).toEqual(original.values)
  })

  it('adds universal topic candidates for all topic ids', () => {
    const query = createUniversalTopicFiltersBaseQueryForTest()

    appendUniversalTopicFilters(query, ['topic-1', 'topic-2'])

    expect(query.text).toContain('relation__post__category__topic')
    expect(query.text).toContain('FROM relation__post__category__topic_alias relation')
    expect(query.text).toContain('JOIN topic_aliases alias ON alias.id = relation.object_id')
    expect(query.text).not.toContain('post_topic_alias_sources')
    expect(query.text).toContain('alias.topic_id = ANY')
    expect(query.text).toContain('deleted_at IS NULL')
    expect(query.text).toContain('votes_score_net > 0')
    expect(query.text).toContain('post_review_topic_ratings')
    expect(query.text).toContain('post_data_point_topics')
    expect(query.values).toEqual([
      ['topic-1', 'topic-2'],
      ['topic-1', 'topic-2'],
      ['topic-1', 'topic-2'],
      ['topic-1', 'topic-2'],
      2,
    ])
  })

  it('uses a custom post table alias', () => {
    const query = createUniversalTopicFiltersBaseQueryForTest()

    appendUniversalTopicFilters(query, ['topic-1'], 'posts')

    expect(query.text).toContain('posts.id IN')
  })

  it('aggregates universal-topic candidates before filtering community posts', () => {
    const query = createUniversalTopicFiltersBaseQueryForTest()

    appendUniversalTopicFilters(query, ['topic-1', 'topic-2', 'topic-1'])

    expect(query.text.match(/UNION/g)).toHaveLength(3)
    expect(query.text).toContain('GROUP BY universal_topic_candidates.post_id')
    expect(query.text).toContain('HAVING COUNT(*) =')
    expect(query.values).toContainEqual(['topic-1', 'topic-2'])
    expect(query.values).toContain(2)
  })

  it('adds linked and exact hashtag filters and rejects unknown hashtags', () => {
    const query = createUniversalTopicFiltersBaseQueryForTest()

    appendHashtagFilters(
      query,
      { aliasIds: ['alias-1'], hasUnknownHashtag: true, topicIds: ['topic-1'] },
      'posts',
    )

    expect(query.text).not.toContain('post_topic_alias_sources')
    expect(query.text).toContain('relation__post__category__topic_alias')
    expect(query.text).toContain('AND FALSE')
    expect(query.text).toContain('posts.id')
    expect(query.values).toContain('topic-1')
    expect(query.values).toContain('alias-1')
  })
})
