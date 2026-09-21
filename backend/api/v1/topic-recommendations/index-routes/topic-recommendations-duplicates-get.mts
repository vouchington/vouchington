import type { Context } from '@jongleberry/api-server'
import { findTopicRecommendationDuplicates } from '@services/topic-recommendations'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'

app.route('/api/v1/topic-recommendations/duplicates').get(async (ctx: Context) => {
  await requireAuth(ctx, 'GET:/api/v1/topic-recommendations/duplicates')

  const query = ctx.query as Record<string, unknown>
  const topic_title = String(query.topic_title ?? '')
  const topic_slug = String(query.topic_slug ?? '')
  const topic_aliases = String(query.topic_aliases ?? '')
  const topic_markdown = String(query.topic_markdown ?? '')

  const result = await findTopicRecommendationDuplicates({
    topic_title: topic_title?.trim() ?? '',
    topic_slug: topic_slug?.trim() ?? '',
    topic_aliases: topic_aliases
      ? topic_aliases.split(',').flatMap(s => (s.trim() ? [s.trim()] : []))
      : [],
    topic_markdown: topic_markdown?.trim() || undefined,
  })

  ctx.json(result)
})
