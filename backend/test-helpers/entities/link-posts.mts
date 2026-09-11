import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertTestUrlDirect } from './urls.mts'
import { insertTestPost } from './posts.mts'

/**
 * Insert a link post backed by a crawl record so the article embed is populated.
 * The crawl title drives `link-post-article-embed` visibility in the rendered UI.
 * The URL is inserted directly (no crawler auto-creation or queue enqueue), so there's
 * no background crawler job that could race with and overwrite the fixture title.
 */
export async function insertTestLinkPostWithCrawl(data: {
  createdById: string
  title?: string
  crawlTitle: string
  thumbnailUrl?: string
}): Promise<{ postId: string; slug: string; urlId: string }> {
  const { randomUUID } = await import('node:crypto')
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const href = `https://example-${suffix}.com/article`
  const url = await insertTestUrlDirect(null, href, { content_type: 'text/html' })
  if (!url) throw new Error('insertTestLinkPostWithCrawl: insertTestUrlDirect returned null')
  const urlId = url.id
  const metaTags = data.thumbnailUrl ? JSON.stringify({ 'og:image': data.thumbnailUrl }) : '{}'

  await write(sql`/* insertTestLinkPostWithCrawl */
    INSERT INTO crawls (url_id, response_status_code, markdown, title, meta_tags, completed_at)
    VALUES (${urlId}, 200, '', ${data.crawlTitle}, ${metaTags}::jsonb, NOW())
  `)

  const postTitle = data.title ?? `Test Link Post ${suffix}`
  const slug = `test-link-post-${suffix}`
  const postId = await insertTestPost({
    title: postTitle,
    slug,
    createdById: data.createdById,
    markdown: '',
    postType: 'link',
    urlId,
  })
  return { postId, slug, urlId }
}

/**
 * Insert a link post with no crawl or RSS data so the embed falls back to the
 * bare source URL link (link-post-source-url).
 */
export async function insertTestLinkPostBare(data: {
  createdById: string
  title?: string
}): Promise<{ postId: string; slug: string; urlId: string }> {
  const { randomUUID } = await import('node:crypto')
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const href = `https://example-${suffix}.com/bare`
  const url = await insertTestUrlDirect(null, href, { content_type: 'text/html' })
  if (!url) throw new Error('insertTestLinkPostBare: insertTestUrlDirect returned null')
  const urlId = url.id

  const postTitle = data.title ?? `Test Bare Link Post ${suffix}`
  const slug = `test-bare-link-post-${suffix}`
  const postId = await insertTestPost({
    title: postTitle,
    slug,
    createdById: data.createdById,
    markdown: '',
    postType: 'link',
    urlId,
  })
  return { postId, slug, urlId }
}

export async function insertTestLinkPostWithVideoUrl(data: {
  createdById: string
  title?: string
}): Promise<{ postId: string; slug: string; urlId: string }> {
  const { randomUUID } = await import('node:crypto')
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const href = `https://www.youtube.com/watch?v=pw-${suffix}`
  const url = await insertTestUrlDirect(null, href, { content_type: 'text/html' })
  if (!url) throw new Error('insertTestLinkPostWithVideoUrl: insertTestUrlDirect returned null')
  const slug = `test-video-link-post-${suffix}`
  const postId = await insertTestPost({
    title: data.title ?? `Test Video Link Post ${suffix}`,
    slug,
    createdById: data.createdById,
    markdown: '',
    postType: 'link',
    urlId: url.id,
  })
  return { postId, slug, urlId: url.id }
}
