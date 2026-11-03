import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import onError from '@modules/on-error'
import { isSlug, isUUID } from '@modules/utils'
import type { PostType } from '@services/posts/types'
import type { PrivateUser } from '@services/users/types'
import type { ArticleSyncItem, ArticleSyncResult } from '@voucha/types/article-sync'

import { parseFrontmatter, extractTitleFromMarkdown } from './parse.mts'
import { rewriteRelativeArticleLinks } from './relative-links.mts'
import { processPreparedArticles } from './sync-process.mts'
import { getArticleMarkdown, listArticleMarkdownFiles } from './storage.mts'
import { contentHash, summarizeResults, type PreparedArticle } from './sync-helpers.mts'
import { getArticleSyncBatchSize } from './work-limits.mts'

const ALLOWED_POST_TYPES: ReadonlySet<PostType> = new Set(['article', 'blog_post'])

type ArticleSyncFile = { file: string }

const LOCAL_ARTICLES_DIR = join(import.meta.dirname, '..', '..', '..', 'articles')

export async function syncArticles(currentUser: PrivateUser): Promise<ArticleSyncResult> {
  return syncArticleFiles(currentUser, await listArticleMarkdownFiles(), getArticleMarkdown)
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
  const batchSize = getArticleSyncBatchSize()

  for (let offset = 0; offset < mdFiles.length; offset += batchSize) {
    const prepared: PreparedArticle[] = []
    const batch = mdFiles.slice(offset, offset + batchSize)
    for (const articleFile of batch) {
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

    if (prepared.length === 0) continue

    // oxlint-disable-next-line no-await-in-loop -- each bounded batch must finish its lookup and writes before the next batch loads
    await processPreparedArticles(currentUser, prepared)
  }

  return summarizeResults(results)
}
