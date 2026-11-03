import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'
import { getPostByAny } from '@services/posts/get'
import { createTestTopic, createTestUser, hasPostRelatedTopic } from '@voucha/test-helpers'
import {
  countCapturedQueriesByAnnotation,
  withCapturedTestQueries,
} from '@voucha/test-helpers/query-capture'

import { stubArticleBucket, syncOwnedArticles } from '../../test-helpers/article-sync-fixtures.mts'

import { syncArticles } from './sync.mts'

describe('article sync decisions', () => {
  it('rejects files without titles or with unsupported post types before lookup', async () => {
    const currentUser = await createTestUser({ administrator: true })
    stubArticleBucket(
      new Map([
        ['a-no-title.md', '---\nslug: no-title\n---\nBody without a heading.'],
        ['b-bad-type.md', '---\ntitle: Bad Type\npost_type: comment\n---\nBody.'],
      ]),
    )

    const { result, queries } = await withCapturedTestQueries(() => syncArticles(currentUser))

    expect(result.results.map(item => item.error)).toEqual([
      'No title found',
      'Invalid post_type "comment". Allowed: article, blog_post',
    ])
    expect(result.summary.errored).toBe(2)
    expect(countCapturedQueriesByAnnotation(queries, 'prefetchArticlePosts')).toBe(0)
  })

  it('reports a post type mismatch after an earlier file creates the slug', async () => {
    const currentUser = await createTestUser({ administrator: true })
    const slug = `type-mismatch-${randomUUID()}`
    stubArticleBucket(
      new Map([
        ['article.md', `---\ntitle: Article\nslug: ${slug}\npost_type: article\n---\nBody.`],
        ['blog.md', `---\ntitle: Blog\nslug: ${slug}\npost_type: blog_post\n---\nBody.`],
      ]),
    )

    const result = await syncOwnedArticles(new Set([slug]), () => syncArticles(currentUser))

    expect(result.results.map(item => item.action)).toEqual(['created', 'error'])
    expect(result.results[1]?.error).toBe(
      'Post type mismatch: existing="article", expected="blog_post"',
    )
    expect((await getPostByAny(slug))?.title).toBe('Article')
  })

  it('tags topics after create, update, and unchanged skip', async () => {
    const currentUser = await createTestUser({ administrator: true })
    const slug = `topic-sync-${randomUUID()}`
    const topics = await Promise.all(
      ['create', 'update', 'skip'].map(stage =>
        createTestTopic({
          name: `Article sync ${stage} ${slug}`,
          slug: `${stage}-${slug}`,
          user: currentUser,
        }),
      ),
    )
    const objects = new Map<string, string>()
    stubArticleBucket(objects)

    for (const [index, topic] of topics.entries()) {
      const title = index === 0 ? 'First title' : 'Updated title'
      objects.set(
        'topic.md',
        `---\ntitle: ${title}\nslug: ${slug}\ntopics:\n  - ${topic.slug}\n---\nBody.`,
      )
      const result = await syncOwnedArticles(new Set([slug]), () => syncArticles(currentUser))

      expect(result.results[0]?.action).toBe(['created', 'updated', 'skipped'][index])
      const post = await getPostByAny(slug)
      expect(post?.title).toBe(title)
      expect(await hasPostRelatedTopic(post!.id, topic.id)).toBe(true)
    }
  })
})
