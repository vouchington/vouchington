import app from '@voucha/api/app'
import type { Context } from '@jongleberry/api-server'
import { getTopicIdByAnyCached } from '@services/entity-cache'
import {
  getTopicByAnyCached,
  getTopicByAnyCachedBatch,
  getTopicMetricsByAnyCachedBatch,
} from '@services/entity-fetch'
import { getTopicIdsCached } from '@services/entity-fetch/search-caches'
import { parseTopicsSearchParams } from '@services/search-params'
import { clampAnonLimit } from '@modules/search-utils'
import { getTopicTypeSlug } from '@voucha/types/entities/topic'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS, HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import { toFrontmatter } from '@modules/utils'

const siteOrigin = process.env.SITE_ORIGIN ?? 'https://voucha.ai'
const MD_CONTENT_TYPE = 'text/markdown; charset=utf-8'

function sendMarkdown(ctx: Context, content: string): void {
  ctx.response.buffer(Buffer.from(content, 'utf8'), MD_CONTENT_TYPE)
}

function parseTypeConstraint(value: unknown): string[] {
  if (typeof value !== 'string') return []
  return value.split(',').flatMap(v => {
    const trimmed = v.trim()
    return trimmed ? [trimmed] : []
  })
}

app.route('/md/topics').get(async (ctx: Context) => {
  const { shouldReturnEmpty, searchOptions } = await parseTopicsSearchParams(ctx.query)
  searchOptions.limit = clampAnonLimit(searchOptions.limit)
  searchOptions.omitLimit = false

  ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)

  if (shouldReturnEmpty) {
    const frontmatter = toFrontmatter({
      has_next_page: false,
      end_cursor: null,
      start_cursor: null,
    })
    sendMarkdown(ctx, `${frontmatter}\n\nNo topics found.\n`)
    return
  }

  const result = await getTopicIdsCached(searchOptions)
  const topicIds = result.results.map((r: { id: string }) => r.id)

  const topics = await getTopicByAnyCachedBatch(topicIds)
  const metrics = await getTopicMetricsByAnyCachedBatch(topicIds)

  const metricsMap = new Map(metrics.flatMap(m => (m ? [[m.id, m] as const] : [])))

  const frontmatter = toFrontmatter({
    has_next_page: result.page_info.has_next_page,
    end_cursor: result.page_info.end_cursor,
    start_cursor: result.page_info.start_cursor,
  })

  const lines: string[] = [frontmatter, '']

  for (const topic of topics) {
    if (!topic) continue
    if (topic.noindex) continue
    const slug = getTopicTypeSlug(topic.topic_type)
    const url = `${siteOrigin}/${slug}/${topic.slug}`
    const m = metricsMap.get(topic.id)
    lines.push(`## [${topic.name}](${url})`)
    lines.push('')
    lines.push(`- **Type**: ${topic.topic_type}`)
    if (m) {
      lines.push(`- **Discussions**: ${m.count.discussions}`)
      lines.push(`- **Reviews**: ${m.count.reviews}`)
    }
    lines.push('')
  }

  sendMarkdown(ctx, lines.join('\n'))
})

app.route('/md/topics/:idOrSlug').get(async (ctx: Context) => {
  const topicId = await getTopicIdByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(topicId, 404, 'Topic not found')
  const topic = await getTopicByAnyCached(topicId)
  ctx.assert(topic, 404, 'Topic not found')
  const topicTypes = parseTypeConstraint(ctx.query.topic_types)
  ctx.assert(
    topicTypes.length === 0 || topicTypes.includes(topic.topic_type),
    404,
    'Topic not found',
  )
  ctx.assert(!topic.noindex, 404, 'Topic not found')

  ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)

  const slug = getTopicTypeSlug(topic.topic_type)
  const url = `${siteOrigin}/${slug}/${topic.slug}`
  const frontmatter = toFrontmatter({
    name: topic.name,
    url,
    topic_type: topic.topic_type,
    slug: topic.slug,
    created_at:
      topic.created_at != null ? new Date(topic.created_at as unknown as string) : undefined,
  })

  sendMarkdown(ctx, `${frontmatter}\n\n# ${topic.name}\n\n${topic.markdown}\n`)
})
