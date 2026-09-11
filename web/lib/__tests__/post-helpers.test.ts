import { describe, expect, it } from 'vitest'
import {
  getCanonicalPostPath,
  getPostCollectionLabel,
  getPostCollectionPath,
  getPostPath,
  getPostSchemaKind,
  getPostTitle,
  getPostTypePath,
  getVoteScoreNet,
} from '../post-helpers'
import type { Post, PostType } from '@/types/posts'
import type { PostResponseBody } from '@/types/api-responses'

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    post_type: 'discussion',
    privacy: 'public',
    broadcast: 'everyone',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by_id: 'user-1',
    is_anonymous: false,
    ...overrides,
  } as Post
}

const postTypePathCases = [
  ['discussion', 'discussion'],
  ['review', 'review'],
  ['data_point', 'data-point'],
  ['topic_recommendation', 'topic-recommendations'],
  ['story', 'discussion'],
  ['article', 'article'],
  ['blog_post', 'blog-post'],
] satisfies ReadonlyArray<readonly [Exclude<PostType, 'comment'>, string]>

describe('getPostPath', () => {
  it('uses slug when available', () => {
    const post = makePost({ slug: 'my-slug' })
    expect(getPostPath('discussion', post)).toBe('/discussion/my-slug')
  })

  it('falls back to id when no slug', () => {
    const post = makePost({ id: 'abc123' })
    expect(getPostPath('review', post)).toBe('/review/abc123')
  })

  it('falls back to id when slug is empty', () => {
    const post = makePost({ id: 'abc123', slug: '' })
    expect(getPostPath('review', post)).toBe('/review/abc123')
  })
})

describe('getCanonicalPostPath', () => {
  it('uses the canonical discussion path for stories', () => {
    const post = makePost({ id: 'story-1', post_type: 'story' })
    expect(getCanonicalPostPath(post)).toBe('/discussion/story-1')
  })

  it('uses the canonical topic recommendation path', () => {
    const post = makePost({ id: 'topic-rec-1', post_type: 'topic_recommendation' })
    expect(getCanonicalPostPath(post)).toBe('/topic-recommendations/topic-rec-1')
  })

  it('uses slug when available', () => {
    const post = makePost({ id: 'post-1', slug: 'my-post' })
    expect(getCanonicalPostPath(post)).toBe('/discussion/my-post')
  })

  it('falls back to id when slug is null', () => {
    const post = makePost({ id: 'post-1', slug: null })
    expect(getCanonicalPostPath(post)).toBe('/discussion/post-1')
  })

  it('falls back to id when slug is undefined', () => {
    const post = makePost({ id: 'post-1', slug: undefined })
    expect(getCanonicalPostPath(post)).toBe('/discussion/post-1')
  })

  it('falls back to id when slug is empty', () => {
    const post = makePost({ id: 'post-1', slug: '' })
    expect(getCanonicalPostPath(post)).toBe('/discussion/post-1')
  })

  it('rejects comments without root post context', () => {
    const post = makePost({ id: 'comment-1', post_type: 'comment' })
    expect(() => getCanonicalPostPath(post)).toThrow('Comment routes require root post context')
  })
})

describe('getPostTypePath', () => {
  it.each(postTypePathCases)('maps %s to %s', (postType, expectedPath) => {
    expect(getPostTypePath(postType)).toBe(expectedPath)
  })

  it('rejects comment route segments without root post context', () => {
    expect(() => getPostTypePath('comment')).toThrow('Comment routes require root post context')
  })
})

describe('getPostTitle', () => {
  it('returns post title when set', () => {
    const post = makePost({ title: 'My Post Title' })
    expect(getPostTitle(post)).toBe('My Post Title')
  })

  it('returns Untitled Review for review type', () => {
    const post = makePost({ post_type: 'review' })
    expect(getPostTitle(post)).toBe('Untitled Review')
  })

  it('returns Untitled Data Point for data_point type', () => {
    const post = makePost({ post_type: 'data_point' })
    expect(getPostTitle(post)).toBe('Untitled Data Point')
  })

  it('returns Untitled Comment for comment type', () => {
    const post = makePost({ post_type: 'comment' })
    expect(getPostTitle(post)).toBe('Untitled Comment')
  })

  it('returns Untitled Discussion for discussion type', () => {
    const post = makePost({ post_type: 'discussion' })
    expect(getPostTitle(post)).toBe('Untitled Discussion')
  })

  it('returns Untitled Link for link type', () => {
    const post = makePost({ post_type: 'link' })
    expect(getPostTitle(post)).toBe('Untitled Link')
  })

  it('returns Untitled Discussion for unknown type', () => {
    const post = makePost({ post_type: 'unknown_type' as any })
    expect(getPostTitle(post)).toBe('Untitled Discussion')
  })
})

describe('getPostCollectionLabel', () => {
  it('returns Reviews for review slug', () => {
    expect(getPostCollectionLabel('review')).toBe('Reviews')
  })

  it('returns Data Points for data-point slug', () => {
    expect(getPostCollectionLabel('data-point')).toBe('Data Points')
  })

  it('returns Articles for article slug', () => {
    expect(getPostCollectionLabel('article')).toBe('Articles')
  })

  it('returns Blog Posts for blog-post slug', () => {
    expect(getPostCollectionLabel('blog-post')).toBe('Blog Posts')
  })

  it('returns Stories for story slug', () => {
    expect(getPostCollectionLabel('story')).toBe('Stories')
  })

  it('returns Discussions for discussion slug', () => {
    expect(getPostCollectionLabel('discussion')).toBe('Discussions')
  })

  it('returns Links for link slug', () => {
    expect(getPostCollectionLabel('link')).toBe('Links')
  })
})

describe('getPostCollectionPath', () => {
  it('returns /reviews for review', () => {
    expect(getPostCollectionPath('review')).toBe('/reviews')
  })

  it('returns /data-points for data-point', () => {
    expect(getPostCollectionPath('data-point')).toBe('/data-points')
  })

  it('returns /articles for article', () => {
    expect(getPostCollectionPath('article')).toBe('/articles')
  })

  it('returns /blog for blog-post', () => {
    expect(getPostCollectionPath('blog-post')).toBe('/blog')
  })

  it('returns /stories for story', () => {
    expect(getPostCollectionPath('story')).toBe('/stories')
  })

  it('returns /discussions for discussion', () => {
    expect(getPostCollectionPath('discussion')).toBe('/discussions')
  })

  it('returns /links for link', () => {
    expect(getPostCollectionPath('link')).toBe('/links')
  })
})

describe('getVoteScoreNet', () => {
  it('returns null when no election', () => {
    const data = { post: makePost(), html: '' } as PostResponseBody
    expect(getVoteScoreNet(data)).toBeNull()
  })

  it('returns net score (up - down)', () => {
    const data = {
      post: makePost(),
      html: '',
      post_election: {
        __entity_type: 'post_election' as const,
        id: 'election-1',
        votes_count_up: 10,
        votes_count_down: 3,
        votes_score_sort: 0,
        votes_score_net: 7,
      },
    } as PostResponseBody
    expect(getVoteScoreNet(data)).toBe(7)
  })
})

describe('getPostSchemaKind', () => {
  it('returns review for review slug', () => {
    expect(getPostSchemaKind('review')).toBe('review')
  })

  it('returns article for article slug', () => {
    expect(getPostSchemaKind('article')).toBe('article')
  })

  it('returns blog-post for blog-post slug', () => {
    expect(getPostSchemaKind('blog-post')).toBe('blog-post')
  })

  it('returns data-point for data-point slug', () => {
    expect(getPostSchemaKind('data-point')).toBe('data-point')
  })

  it('returns discussion for discussion slug', () => {
    expect(getPostSchemaKind('discussion')).toBe('discussion')
  })

  it('returns discussion for story slug (no distinct schema kind)', () => {
    expect(getPostSchemaKind('story')).toBe('discussion')
  })

  it('returns article for link slug', () => {
    expect(getPostSchemaKind('link')).toBe('article')
  })
})
