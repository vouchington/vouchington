import { beginTransaction, write } from '@data-stores/psql'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { enqueueOnPostCreated } from '@queues/entity-listeners/enqueues'
import type { BasicUser } from '@voucha/types/entities/user'
import { normalizeKey } from '@ts-shared/utils/strings'
import sql from 'sql-template-strings'
import { checkDuplicateTopicInStore } from './check-duplicate-topic.mts'
import { createTopicRecommendation } from './create-topic-recommendation.mts'

type CreateRecommendationInput = {
  source_entity_type: 'post'
  source_entity_id: string
  wikipedia_pageid: string
  wikipedia_title: string
  wikipedia_url: string
  wikipedia_extract?: string | null
  wikipedia_description?: string | null
  wikipedia_thumbnail_url?: string | null
  suggested_topic_name: string
  suggested_topic_slug: string
  extraction_method: 'llm_extraction'
  extraction_keyword: string
  extraction_confidence: number
}

export async function createRecommendation(
  currentUser: BasicUser,
  input?: CreateRecommendationInput,
): Promise<{ id: string } | null> {
  if (!input) return null

  await using query = await beginTransaction()
  const options = { query }
  const dedupeKey = input.wikipedia_pageid || input.suggested_topic_slug
  await write(
    sql`/* createRecommendation */ SELECT pg_advisory_xact_lock(hashtext(${`topic-recommendation:${dedupeKey}`}))`,
    options,
  )

  const duplicate = await checkDuplicateTopicInStore(
    {
      title: input.wikipedia_title,
      url: input.wikipedia_url,
      pageId: input.wikipedia_pageid,
    },
    options,
  )
  let recommendation: Awaited<ReturnType<typeof createTopicRecommendation>> | null = null
  if (!duplicate.is_duplicate) {
    const wikipediaHostname = new URL(input.wikipedia_url).hostname
    recommendation = await createTopicRecommendation(
      currentUser,
      {
        title: `Add topic: ${input.suggested_topic_name}`,
        markdown: buildRecommendationMarkdown(input),
        topic_title: input.suggested_topic_name,
        topic_slug: input.suggested_topic_slug,
        topic_markdown: buildTopicMarkdown(input),
        topic_hostname: wikipediaHostname,
        topic_hostnames: [wikipediaHostname],
        topic_aliases: buildTopicAliases(input.wikipedia_title, input.suggested_topic_name),
        topic_wikipedia_pageid: input.wikipedia_pageid,
      },
      { query, skipCreatedEvents: true },
    )
  }
  await query.commit()

  if (!recommendation) {
    return null
  }

  entityCacheBloomFilters.posts.add([normalizeKey(recommendation.id)])
  void enqueueOnPostCreated(recommendation.id)

  return { id: recommendation.id }
}

function buildRecommendationMarkdown(input: CreateRecommendationInput): string {
  return [
    'Suggested by the Wikipedia recommender.',
    '',
    `- Source entity: ${input.source_entity_type} ${input.source_entity_id}`,
    `- Extraction method: ${input.extraction_method}`,
    `- Extraction keyword: ${input.extraction_keyword}`,
    `- Confidence: ${formatExtractionConfidence(input.extraction_confidence)}`,
    `- Wikipedia title: ${input.wikipedia_title}`,
    `- Wikipedia page ID: ${input.wikipedia_pageid}`,
    `- Wikipedia URL: ${input.wikipedia_url}`,
    input.wikipedia_description ? `- Wikipedia description: ${input.wikipedia_description}` : '',
    input.wikipedia_thumbnail_url ? `- Wikipedia thumbnail: ${input.wikipedia_thumbnail_url}` : '',
    '',
    input.wikipedia_extract ? '## Wikipedia summary' : '',
    input.wikipedia_extract ?? '',
  ]
    .filter(Boolean)
    .join('\n')
}

function formatExtractionConfidence(confidence: number): string {
  if (
    typeof confidence !== 'number' ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new TypeError('extraction_confidence must be a finite number between 0 and 1')
  }
  return confidence.toFixed(2)
}

function buildTopicMarkdown(input: CreateRecommendationInput): string | undefined {
  const markdown = [input.wikipedia_description, input.wikipedia_extract]
    .filter(Boolean)
    .join('\n\n')
    .trim()

  return markdown || undefined
}

function buildTopicAliases(
  wikipediaTitle: string,
  suggestedTopicName: string,
): string[] | undefined {
  const aliases = new Set<string>()
  const normalizedWikipediaTitle = wikipediaTitle.trim().toLowerCase()
  const normalizedSuggestedTopicName = suggestedTopicName.trim().toLowerCase()

  if (normalizedWikipediaTitle && normalizedWikipediaTitle !== normalizedSuggestedTopicName) {
    aliases.add(normalizedWikipediaTitle)
  }

  return aliases.size > 0 ? [...aliases] : undefined
}
