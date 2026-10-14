import { randomUUID } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'
import { getPostByAny } from '@services/posts/get'
import type { Post } from '@services/posts/types'
import { createTestTopic, createTestUser, hasPostRelatedTopic } from '@voucha/test-helpers'

import { syncOwnedArticles } from '../../test-helpers/article-sync-fixtures.mts'

import { syncArticles } from './sync.mts'

describe('article sync decisions', () => {
  it('rejects files without titles or with unsupported post types before lookup', async () => {
    const currentUser = await createTestUser({ administrator: true })
    const files = ['no-title.md', 'bad-type.md'].map(file => ({
      file,
      key: `articles/${file}`,
      cacheToken: `${file}:v1`,
    }))
    const markdown = new Map([
      ['no-title.md', '---\nslug: no-title\n---\nBody without a heading.'],
      ['bad-type.md', '---\ntitle: Bad Type\npost_type: comment\n---\nBody.'],
    ])
    const prefetchPosts = vi.fn<() => Promise<Map<string, Post>>>(async () => new Map())

    const result = await syncArticles(currentUser, {
      listArticleMarkdownFiles: async () => files,
      getArticleMarkdown: async article => markdown.get(article.file)!,
      prefetchPosts,
    })

    expect(result.results.map(item => item.error)).toEqual([
      'No title found',
      'Invalid post_type "comment". Allowed: article, blog_post',
    ])
    expect(result.summary.errored).toBe(2)
    expect(prefetchPosts).not.toHaveBeenCalled()
  })

  it('reports a post type mismatch after an earlier file creates the slug', async () => {
    const currentUser = await createTestUser({ administrator: true })
    const slug = `type-mismatch-${randomUUID()}`
    const files = ['article.md', 'blog.md'].map(file => ({
      file,
      key: `articles/${file}`,
      cacheToken: `${file}:v1`,
    }))
    const markdown = new Map([
      ['article.md', `---\ntitle: Article\nslug: ${slug}\npost_type: article\n---\nBody.`],
      ['blog.md', `---\ntitle: Blog\nslug: ${slug}\npost_type: blog_post\n---\nBody.`],
    ])

    const result = await syncOwnedArticles(new Set([slug]), () =>
      syncArticles(currentUser, {
        listArticleMarkdownFiles: async () => files,
        getArticleMarkdown: async article => markdown.get(article.file)!,
      }),
    )

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
    const file = { file: 'topic.md', key: 'articles/topic.md', cacheToken: 'topic:v1' }

    for (const [index, topic] of topics.entries()) {
      const title = index === 0 ? 'First title' : 'Updated title'
      const result = await syncOwnedArticles(new Set([slug]), () =>
        syncArticles(currentUser, {
          listArticleMarkdownFiles: async () => [file],
          getArticleMarkdown: async () =>
            `---\ntitle: ${title}\nslug: ${slug}\ntopics:\n  - ${topic.slug}\n---\nBody.`,
        }),
      )

      expect(result.results[0]?.action).toBe(['created', 'updated', 'skipped'][index])
      const post = await getPostByAny(slug)
      expect(post?.title).toBe(title)
      expect(await hasPostRelatedTopic(post!.id, topic.id)).toBe(true)
    }
  })
})
