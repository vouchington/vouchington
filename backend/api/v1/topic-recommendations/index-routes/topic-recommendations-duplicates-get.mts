import type { Context } from '@jongleberry/api-server'
import { findTopicRecommendationDuplicates } from '@services/topic-recommendations'
import app from '../../../app.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'
import { apiQuery } from '../../../response-contract.mts'
import { defineQueryContract, queryString } from '@modules/pagination'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

const duplicateRecommendationsQuery = defineQueryContract({
  topic_title: queryString(),
  topic_slug: queryString(),
  topic_aliases: queryString(),
  topic_markdown: queryString(),
})

app.route('/api/v1/topic-recommendations/duplicates').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/topic-recommendations/duplicates', duplicateRecommendationsQuery)
  await requireAuth(ctx, 'GET:/api/v1/topic-recommendations/duplicates')

  const query = ctx.query as Record<string, unknown>
  const topic_title = stringFromUnknown(query.topic_title ?? '')
  const topic_slug = stringFromUnknown(query.topic_slug ?? '')
  const topic_aliases = stringFromUnknown(query.topic_aliases ?? '')
  const topic_markdown = stringFromUnknown(query.topic_markdown ?? '')
  validateRequestContract(ctx, 'GET:/api/v1/topic-recommendations/duplicates', {
    query: {
      topic_title: topic_title ?? '',
      topic_slug: topic_slug ?? '',
      topic_aliases: topic_aliases ?? '',
      topic_markdown: topic_markdown ?? '',
    },
  })

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
