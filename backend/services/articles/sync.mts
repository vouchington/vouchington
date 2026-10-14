import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import onError from '@modules/on-error'
import { isSlug, isUUID } from '@modules/utils'
import { createPost } from '@services/posts/create'
import { tagPostWithTopics } from '@services/posts/tagging'
import type { Post, PostType } from '@services/posts/types'
import { updatePost } from '@services/posts/update'
import type { PrivateUser } from '@services/users/types'
import type { ArticleSyncItem, ArticleSyncResult } from '@voucha/types/article-sync'

import { parseFrontmatter, extractTitleFromMarkdown } from './parse.mts'
import { rewriteRelativeArticleLinks } from './relative-links.mts'
import { getArticleMarkdown, listArticleMarkdownFiles } from './storage.mts'
import { SYSTEM_PROVENANCE } from '@voucha/types/entities/content-provenance'
import {
  contentHash,
  lookupKey,
  prefetchPosts,
  summarizeResults,
  type PreparedArticle,
} from './sync-helpers.mts'

const ALLOWED_POST_TYPES: ReadonlySet<PostType> = new Set(['article', 'blog_post'])

type ArticleSyncFile = { file: string }

const LOCAL_ARTICLES_DIR = join(import.meta.dirname, '..', '..', '..', 'articles')

type SyncArticlesDeps = {
  listArticleMarkdownFiles: typeof listArticleMarkdownFiles
  getArticleMarkdown: typeof getArticleMarkdown
}

const defaultSyncArticlesDeps: SyncArticlesDeps = {
  listArticleMarkdownFiles,
  getArticleMarkdown,
}

export async function syncArticles(
  currentUser: PrivateUser,
  deps: SyncArticlesDeps = defaultSyncArticlesDeps,
): Promise<ArticleSyncResult> {
  return syncArticleFiles(
    currentUser,
    await deps.listArticleMarkdownFiles(),
    deps.getArticleMarkdown,
  )
}

export async function syncLocalArticles(
  currentUser: PrivateUser,
  articlesDir = LOCAL_ARTICLES_DIR,
): Promise<ArticleSyncResult> {
  const files = await readdir(articlesDir)
  const mdFiles = files
    .filter(file => file.endsWith('.md') && file !== 'README.md')
    .toSorted()
    .map(file => ({ file }))

  return syncArticleFiles(currentUser, mdFiles, article =>
    readFile(join(articlesDir, article.file), 'utf8'),
  )
}

async function syncArticleFiles<T extends ArticleSyncFile>(
  currentUser: PrivateUser,
  mdFiles: T[],
  loadMarkdown: (articleFile: T) => Promise<string>,
): Promise<ArticleSyncResult> {
  const results: ArticleSyncItem[] = []
  const prepared: PreparedArticle[] = []

  for (const articleFile of mdFiles) {
    const item: ArticleSyncItem = { file: articleFile.file, slug: '', action: 'skipped' }

    try {
      // oxlint-disable-next-line no-await-in-loop -- preserve input order and isolate each file's load failure in its result
      const content = await loadMarkdown(articleFile)
      const { frontmatter, body: authoredBody } = parseFrontmatter(content)
      const body = rewriteRelativeArticleLinks(authoredBody)
      const topics = frontmatter.topics

      const slug = frontmatter.slug || basename(articleFile.file, '.md')
      const title = frontmatter.title || extractTitleFromMarkdown(body)
      const rawPostType = frontmatter.post_type
      if (rawPostType && !ALLOWED_POST_TYPES.has(rawPostType)) {
        item.slug = slug
        item.action = 'error'
        item.error = `Invalid post_type "${rawPostType}". Allowed: ${[...ALLOWED_POST_TYPES].join(', ')}`
        results.push(item)
        continue
      }
      const postType: PostType = rawPostType || 'article'
      item.slug = slug

      if (!title) {
        item.action = 'error'
        item.error = 'No title found'
        results.push(item)
        continue
      }

      if (!isUUID(slug) && !isSlug(slug)) {
        item.action = 'error'
        item.error = 'Invalid post id or slug'
        results.push(item)
        continue
      }

      prepared.push({
        item,
        body,
        topics,
        slug,
        title,
        postType,
        fileHash: contentHash(title, body),
      })
      results.push(item)
    } catch (err) {
      item.action = 'error'
      item.error = err instanceof Error ? err.message : String(err)
      if (err instanceof Error) onError(err)
      results.push(item)
    }
  }

  let existingBySlug: Map<string, Post>
  try {
    existingBySlug = await prefetchPosts(prepared.map(article => article.slug))
  } catch (err) {
    for (const { item } of prepared) {
      item.action = 'error'
      item.error = err instanceof Error ? err.message : String(err)
    }
    if (err instanceof Error) onError(err)
    return summarizeResults(results)
  }

  for (const { item, slug, title, body, topics, postType, fileHash } of prepared) {
    try {
      const key = lookupKey(slug)
      const existing = existingBySlug.get(key)

      if (existing) {
        if (existing.post_type !== postType) {
          item.action = 'error'
          item.error = `Post type mismatch: existing="${existing.post_type}", expected="${postType}"`
          continue
        }

        const existingHash = contentHash(existing.title, existing.markdown)

        if (fileHash === existingHash) {
          item.action = 'skipped'
          if (topics?.length) {
            // oxlint-disable-next-line no-await-in-loop -- topic tagging must finish before this file's result is recorded
            await tagPostWithTopics(currentUser, existing.id, topics)
          }
        } else {
          // oxlint-disable-next-line no-await-in-loop -- duplicate slugs require the update to finish before processing the next file
          const updated = await updatePost(currentUser, existing, { markdown: body, title })
          existingBySlug.set(key, updated)
          item.action = 'updated'
          if (topics?.length) {
            // oxlint-disable-next-line no-await-in-loop -- topic tagging follows the completed update for this file
            await tagPostWithTopics(currentUser, existing.id, topics)
          }
        }
      } else {
        // Articles are platform-authored from the repository, whichever job or script syncs them.
        // oxlint-disable-next-line no-await-in-loop -- duplicate slugs require creation to finish before processing the next file
        const post = await createPost(currentUser, SYSTEM_PROVENANCE, {
          post_type: postType,
          title,
          markdown: body,
          slug,
          broadcast: 'everyone',
          privacy: 'public',
        })
        existingBySlug.set(key, post)
        item.action = 'created'

        if (topics?.length) {
          // oxlint-disable-next-line no-await-in-loop -- topic tagging follows the completed creation for this file
          await tagPostWithTopics(currentUser, post.id, topics)
        }
      }
    } catch (err) {
      item.action = 'error'
      item.error = err instanceof Error ? err.message : String(err)
      if (err instanceof Error) onError(err)
    }
  }

  return summarizeResults(results)
}
