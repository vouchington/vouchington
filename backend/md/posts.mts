import { clampAnonLimit, getPaginationLimits } from '@services/pagination'
import app from '@voucha/api/app'
import type { Context } from '@jongleberry/api-server'
import { getPostIdByAnyCached } from '@services/entity-cache'
import {
  getPostElectionByIdCached,
  getPostElectionByIdCachedBatch,
  getPostMetricsByAnyCachedBatch,
} from '@services/entity-fetch'
import { getPostIdsCached } from '@services/entity-fetch/search-caches'
import { parsePostsSearchParams } from '@services/search-params'

import { toFrontmatter } from '@modules/utils'
import {
  getAnonymousPostRowsByIdsCached,
  getAnonymousPostSnapshotByAnyCached,
} from '@services/posts/anonymous-snapshot'
import type { Post } from '@services/posts/types'
import type { ViewPostElection } from '@services/elections-votes/post/types'

const siteOrigin = process.env.SITE_ORIGIN ?? 'https://voucha.ai'
const MD_CONTENT_TYPE = 'text/markdown; charset=utf-8'
const POST_ROUTE_SLUGS = new Map<string, string>([
  ['article', 'article'],
  ['blog_post', 'blog-post'],
  ['data_point', 'data-point'],
  ['discussion', 'discussion'],
  ['link', 'link'],
  ['review', 'review'],
  ['story', 'story'],
])

function sendMarkdown(ctx: Context, content: string): void {
  ctx.response.buffer(Buffer.from(content, 'utf8'), MD_CONTENT_TYPE)
}

function getPostUrl(post: Post): string {
  const routeSlug = POST_ROUTE_SLUGS.get(post.post_type ?? '') ?? 'discussion'
  return `${siteOrigin}/${routeSlug}/${post.slug ?? post.id}`
}

function getPostMarkdownBody(post: Post): string {
  if (post.post_type === 'story') return post.ai_summary_markdown || post.markdown
  return post.markdown
}

function parseTypeConstraint(value: unknown): string[] {
  if (typeof value !== 'string') return []
  return value.split(',').flatMap(v => {
    const trimmed = v.trim()
    return trimmed ? [trimmed] : []
  })
}

function canIndexMarkdownPost(post: Post, election: ViewPostElection | null | undefined): boolean {
  if (!POST_ROUTE_SLUGS.has(post.post_type ?? '')) return false
  if (!election || election.votes_count_up - election.votes_count_down <= 0) return false
  return true
}

app.route('/md/posts').get(async (ctx: Context) => {
  const { shouldReturnEmpty, searchOptions } = await parsePostsSearchParams(
    ctx.query,
    getPaginationLimits(25),
  )
  searchOptions.limit = clampAnonLimit(searchOptions.limit)
  searchOptions.omitLimit = false

  ctx.set('Cache-Control', 'public')

  if (shouldReturnEmpty) {
    const frontmatter = toFrontmatter({
      has_next_page: false,
      end_cursor: null,
      start_cursor: null,
    })
    sendMarkdown(ctx, `${frontmatter}\n\nNo posts found.\n`)
    return
  }

  const result = await getPostIdsCached(searchOptions)
  const postIds = result.results.map((r: { id: string }) => r.id)

  const [postRows, metrics, elections] = await Promise.all([
    getAnonymousPostRowsByIdsCached(postIds, 'discovery'),
    getPostMetricsByAnyCachedBatch(postIds),
    getPostElectionByIdCachedBatch(postIds),
  ])
  const posts = postRows.map(row => row.post)

  const metricsMap = new Map(metrics.flatMap(m => (m ? [[m.id, m] as const] : [])))
  const electionMap = new Map(elections.flatMap(e => (e ? [[e.id, e] as const] : [])))
  const indexablePosts = posts.flatMap(post =>
    post && canIndexMarkdownPost(post, electionMap.get(post.id)) ? [post] : [],
  )

  const frontmatter = toFrontmatter({
    has_next_page: result.page_info.has_next_page,
    end_cursor: result.page_info.end_cursor,
    start_cursor: result.page_info.start_cursor,
  })

  const lines: string[] = [frontmatter, '']

  for (const post of indexablePosts) {
    const url = getPostUrl(post)
    const m = metricsMap.get(post.id)
    lines.push(`## [${post.title}](${url})`)
    lines.push('')
    lines.push(`- **Type**: ${post.post_type}`)
    lines.push(`- **Created**: ${new Date(post.created_at as unknown as string).toISOString()}`)
    if (m) {
      lines.push(`- **Comments**: ${m.count.descendants}`)
    }
    lines.push('')
  }

  sendMarkdown(ctx, lines.join('\n'))
})

app.route('/md/posts/:idOrSlug').get(async (ctx: Context) => {
  const postId = await getPostIdByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(postId, 404, 'Post not found')
  const { post } = await getAnonymousPostSnapshotByAnyCached(postId, 'discovery')
  ctx.assert(post, 404, 'Post not found')
  const postTypes = parseTypeConstraint(ctx.query.post_types)
  ctx.assert(
    postTypes.length === 0 || postTypes.includes(post.post_type ?? ''),
    404,
    'Post not found',
  )
  const election = await getPostElectionByIdCached(post.id)
  ctx.assert(canIndexMarkdownPost(post, election), 404, 'Post not found')

  ctx.set('Cache-Control', 'public')

  const url = getPostUrl(post)
  const frontmatter = toFrontmatter({
    title: post.title,
    url,
    post_type: post.post_type,
    created_at:
      post.created_at != null ? new Date(post.created_at as unknown as string) : undefined,
    updated_at:
      post.updated_at != null ? new Date(post.updated_at as unknown as string) : undefined,
    slug: post.slug,
  })

  sendMarkdown(ctx, `${frontmatter}\n\n# ${post.title}\n\n${getPostMarkdownBody(post)}\n`)
})
