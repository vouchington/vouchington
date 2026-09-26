import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import onError from '@modules/on-error'
import { createPost } from '@services/posts/create'
import { getPostByAny } from '@services/posts/get'
import { tagPostWithTopics } from '@services/posts/tagging'
import type { PostType } from '@services/posts/types'
import { updatePost } from '@services/posts/update'
import type { PrivateUser } from '@services/users/types'

import { parseFrontmatter, extractTitleFromMarkdown } from './parse.mts'
import { getArticleMarkdown, listArticleMarkdownFiles } from './storage.mts'
import { SYSTEM_PROVENANCE } from '@voucha/types/entities/content-provenance'

const ALLOWED_POST_TYPES: ReadonlySet<PostType> = new Set(['article', 'blog_post'])

export type ArticleSyncItem = {
  file: string
  slug: string
  action: 'created' | 'updated' | 'skipped' | 'error'
  error?: string
}

export type ArticleSyncResult = {
  results: ArticleSyncItem[]
  summary: { created: number; updated: number; skipped: number; errored: number }
}

function contentHash(title: string, markdown: string): string {
  return createHash('sha256').update(`${title}\n${markdown}`).digest('hex')
}

type ArticleSyncFile = {
  file: string
}

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
    .sort()
    .map(file => ({ file }))

  return syncArticleFiles(currentUser, mdFiles, article =>
    readFile(join(articlesDir, article.file), 'utf-8'),
  )
}

async function syncArticleFiles<T extends ArticleSyncFile>(
  currentUser: PrivateUser,
  mdFiles: T[],
  loadMarkdown: (articleFile: T) => Promise<string>,
): Promise<ArticleSyncResult> {
  const results: ArticleSyncItem[] = []

  for (const articleFile of mdFiles) {
    const item: ArticleSyncItem = { file: articleFile.file, slug: '', action: 'skipped' }

    try {
      // oxlint-disable-next-line no-await-in-loop -- preserve input order and isolate each file's load failure in its result
      const content = await loadMarkdown(articleFile)
      const { frontmatter, body } = parseFrontmatter(content)
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

      const fileHash = contentHash(title, body)
      // oxlint-disable-next-line no-await-in-loop -- earlier duplicate slugs must finish before a later file reads the post
      const existing = await getPostByAny(slug)

      if (existing) {
        if (existing.post_type !== postType) {
          item.action = 'error'
          item.error = `Post type mismatch: existing="${existing.post_type}", expected="${postType}"`
          results.push(item)
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
          await updatePost(currentUser, existing, { markdown: body, title })
          item.action = 'updated'
          if (topics?.length) {
            // oxlint-disable-next-line no-await-in-loop -- topic tagging follows the completed update for this file
            await tagPostWithTopics(currentUser, existing.id, topics)
          }
        }
      } else {
        // Articles are platform-authored from the repository, whichever job or script syncs them.
        // oxlint-disable-next-line no-await-in-loop -- duplicate slugs require creation to finish before processing the next file
        const post = await createPost(SYSTEM_PROVENANCE, currentUser, {
          post_type: postType,
          title,
          markdown: body,
          slug,
          broadcast: 'everyone',
          privacy: 'public',
        })
        item.action = 'created'

        if (topics?.length) {
          // oxlint-disable-next-line no-await-in-loop -- topic tagging follows the completed creation for this file
          await tagPostWithTopics(currentUser, post.id, topics)
        }
      }
    } catch (error) {
      item.action = 'error'
      item.error = error instanceof Error ? error.message : String(error)
      if (error instanceof Error) onError(error)
    }

    results.push(item)
  }

  const summary = {
    created: results.filter(r => r.action === 'created').length,
    updated: results.filter(r => r.action === 'updated').length,
    skipped: results.filter(r => r.action === 'skipped').length,
    errored: results.filter(r => r.action === 'error').length,
  }

  return { results, summary }
}
