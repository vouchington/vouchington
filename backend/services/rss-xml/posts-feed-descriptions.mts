import onError from '@modules/on-error'
import { getAdminUserIdsFromPosts } from '@services/markdown/admin-users'
import { renderMarkdownToHtmlBatch } from '@services/markdown'
import { sanitizeRssHtml } from '@jongleberry/vurst-html'
import type { Post } from '@services/posts/types'

export async function renderPostDescriptions(posts: Post[]): Promise<string[]> {
  if (posts.length === 0) return []

  const adminUserIds = await getAdminUserIdsFromPosts(posts)

  let htmlValues: string[]
  if (adminUserIds.size > 0) {
    htmlValues = await renderMixedTrustPostDescriptions(posts, adminUserIds)
  } else {
    htmlValues = await renderMarkdownToHtmlBatch(
      posts.map(p => p.markdown || ''),
      { allowHtml: false, nofollowLinks: true, proxyImages: false },
    )
  }

  return Promise.all(htmlValues.map(sanitizePostDescriptionHtml))
}

async function renderMixedTrustPostDescriptions(
  posts: Post[],
  adminUserIds: Set<string>,
): Promise<string[]> {
  const adminPosts: Array<{ index: number; markdown: string }> = []
  const nonAdminPosts: Array<{ index: number; markdown: string }> = []

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]!
    const isAdmin = post.created_by_id ? adminUserIds.has(post.created_by_id) : false
    const target = isAdmin ? adminPosts : nonAdminPosts
    target.push({ index: i, markdown: post.markdown || '' })
  }

  const [adminHtml, nonAdminHtml] = await Promise.all([
    renderPartition(adminPosts, true),
    renderPartition(nonAdminPosts, false),
  ])

  const htmlValues = new Array<string>(posts.length).fill('')
  for (let i = 0; i < adminPosts.length; i++) {
    htmlValues[adminPosts[i]!.index] = adminHtml[i] ?? ''
  }
  for (let i = 0; i < nonAdminPosts.length; i++) {
    htmlValues[nonAdminPosts[i]!.index] = nonAdminHtml[i] ?? ''
  }
  return htmlValues
}

function renderPartition(posts: Array<{ markdown: string }>, allowHtml: boolean) {
  if (posts.length === 0) return Promise.resolve([])
  return renderMarkdownToHtmlBatch(
    posts.map(e => e.markdown),
    { allowHtml, nofollowLinks: !allowHtml, proxyImages: false },
  )
}

async function sanitizePostDescriptionHtml(html: string): Promise<string> {
  if (!html) return ''
  try {
    const result = await sanitizeRssHtml(Buffer.from(html, 'utf-8'))
    return result.html.toString('utf-8')
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    return ''
  }
}
