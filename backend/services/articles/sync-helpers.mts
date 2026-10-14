import { createHash } from 'node:crypto'

import { read } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import type { Post, PostType } from '@services/posts/types'
import type { ArticleSyncItem, ArticleSyncResult } from '@voucha/types/article-sync'
import sql from 'sql-template-strings'

import type { getArticleMarkdown, listArticleMarkdownFiles } from './storage.mts'

export type SyncArticlesDeps = {
  listArticleMarkdownFiles: typeof listArticleMarkdownFiles
  getArticleMarkdown: typeof getArticleMarkdown
  prefetchPosts?: typeof prefetchPosts
}

export type PreparedArticle = {
  item: ArticleSyncItem
  body: string
  topics: string[] | undefined
  slug: string
  title: string
  postType: PostType
  fileHash: string
}

export function contentHash(title: string, markdown: string): string {
  return createHash('sha256').update(`${title}\n${markdown}`).digest('hex')
}

export function lookupKey(slug: string): string {
  return slug.toLowerCase()
}

export async function prefetchPosts(slugs: string[]): Promise<Map<string, Post>> {
  const slugKeys = new Set<string>()
  const ids = new Set<string>()
  for (const slug of slugs) {
    const key = lookupKey(slug)
    if (isUUID(slug)) ids.add(key)
    else slugKeys.add(key)
  }
  if (slugKeys.size === 0 && ids.size === 0) return new Map()

  const { rows } = await read<Post & { lookup_key: string }>(
    sql`/* prefetchArticlePosts */
      WITH matched_posts AS (
        SELECT slug AS lookup_key, post_id
        FROM post_slugs
        WHERE slug = ANY(${[...slugKeys]}::text[])
        UNION ALL
        SELECT id::text AS lookup_key, id AS post_id
        FROM posts
        WHERE id = ANY(${[...ids]}::uuid[])
      )
      SELECT matched_posts.lookup_key, view_posts.*
      FROM matched_posts
      JOIN view_posts ON view_posts.id = matched_posts.post_id
    `,
  )
  return new Map(rows.map(({ lookup_key, ...post }) => [lookup_key, post]))
}

export function summarizeResults(results: ArticleSyncItem[]): ArticleSyncResult {
  const summary = {
    created: results.filter(r => r.action === 'created').length,
    updated: results.filter(r => r.action === 'updated').length,
    skipped: results.filter(r => r.action === 'skipped').length,
    errored: results.filter(r => r.action === 'error').length,
  }

  return { results, summary }
}
