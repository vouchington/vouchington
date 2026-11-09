import { describe, expect, it } from 'vitest'
import { createEligiblePostsCteBaseQueryForTest } from '@voucha/test-helpers'
import { appendEligiblePostsCTE } from './eligible-posts-cte.mts'

const currentUser = {
  __entity_type: 'user' as const,
  id: '00000000-0000-0000-0000-000000000001',
  roles: [],
}

describe('appendEligiblePostsCTE', () => {
  it('adds text search and universal topic filters', () => {
    const query = createEligiblePostsCteBaseQueryForTest()

    appendEligiblePostsCTE(query, {
      currentUser,
      postTypes: undefined,
      sort: 'new',
      textSearchQuery: ' rewards ',
      universalTopicIds: ['topic-1'],
      hashtagTopicIds: undefined,
      hashtagAliasIds: undefined,
      hasUnknownHashtag: undefined,
    })

    expect(query.text).toContain("websearch_to_tsquery('voucha_english'")
    expect(query.text).toContain(
      'JOIN posts root_post ON root_post.id = COALESCE(posts.root_post_id, posts.id)',
    )
    expect(query.text).toContain('root_post.approved_at')
    expect(query.text).toContain('relation__post__category__topic')
    expect(query.text).not.toContain('post_topic_alias_sources')
    expect(query.text).toContain('FROM relation__post__category__topic_alias relation')
    expect(query.text).toContain('SELECT alias.id FROM topic_aliases alias WHERE alias.topic_id =')
    expect(query.text).toContain('post_review_topic_ratings')
    expect(query.text).toContain('post_data_point_topics')
    expect(query.text).toContain('excluded_topics.topic_id = topic_aliases.topic_id')
    expect(query.values).toContain('rewards')
    expect(query.values).toContain('topic-1')
    expect(query.values).toContain(currentUser.id)
  })

  it('adds linked and exact hashtag filters and rejects unknown hashtags', () => {
    const query = createEligiblePostsCteBaseQueryForTest()

    appendEligiblePostsCTE(query, {
      currentUser,
      postTypes: undefined,
      sort: 'new',
      textSearchQuery: undefined,
      universalTopicIds: [],
      hashtagTopicIds: ['topic-1'],
      hashtagAliasIds: ['alias-1'],
      hasUnknownHashtag: true,
    })

    expect(query.text).not.toContain('post_topic_alias_sources')
    expect(query.text).toContain('relation__post__category__topic_alias relation')
    expect(query.text).toContain('AND FALSE')
    expect(query.values).toContain('topic-1')
    expect(query.values).toContain('alias-1')
  })

  it('exempts comments from the hidden anti-join only when comments are requested', () => {
    const build = (postTypes: string[] | undefined) => {
      const query = createEligiblePostsCteBaseQueryForTest()
      appendEligiblePostsCTE(query, {
        currentUser,
        postTypes: postTypes as never,
        sort: 'new',
        textSearchQuery: undefined,
        universalTopicIds: undefined,
        hashtagTopicIds: undefined,
        hashtagAliasIds: undefined,
        hasUnknownHashtag: undefined,
      })
      return query.text
    }

    expect(build(undefined)).not.toContain("posts.post_type = 'comment' OR")
    expect(build(['discussion'])).not.toContain("posts.post_type = 'comment' OR")
    expect(build(['comment', 'discussion'])).toContain("posts.post_type = 'comment' OR")
  })
})
