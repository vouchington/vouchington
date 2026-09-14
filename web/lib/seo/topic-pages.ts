import type { Metadata } from 'next'

import { createExcerpt, createNoIndexMetadata, createPageMetadata } from './metadata'
import { buildAbsoluteUrl } from './constants'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { createBreadcrumbSchema, createTopicSchema } from './structured-data'
import { getSchemaOrgType } from './schema-org-types'
import { getTopicDisplayTitle } from '@/lib/topics/display-name'
import { buildImagePath } from '@/lib/utils/image-url'
import type { Topic, TopicMetrics } from '@/types/topics'
import type { Translator } from '@ts-shared/ui-messages'

interface TopicSectionOptions {
  label: string
  path: string
  rssUrl?: string
}

export function createTopicSectionMetadata(
  topic: Topic,
  topicTypeSlug: string,
  section: TopicSectionOptions,
): Metadata {
  // A topic flagged noindex emits noindex on every one of its section pages.
  if (topic.noindex) return createNoIndexMetadata()
  const pagePath = `/${topicTypeSlug}/${topic.slug}/${section.path}`

  return createPageMetadata({
    title: `${getTopicDisplayTitle(topic)} ${section.label}`,
    description: createExcerpt(topic.html ?? topic.markdown),
    path: pagePath,
    imagePath: buildImagePath(topic.hero_image_id ?? topic.logo_image_id),
    ...(section.rssUrl ? { rssUrl: section.rssUrl } : {}),
  })
}

export function createTopicSectionStructuredData(
  t: Translator,
  topic: Topic,
  topicTypeSlug: string,
  section: TopicSectionOptions,
  categorySlugs?: string[],
  topicMetrics?: TopicMetrics | null,
) {
  const topicPath = `/${topicTypeSlug}/${topic.slug}`
  const pagePath = `/${topicTypeSlug}/${topic.slug}/${section.path}`
  const schemaOrgType = categorySlugs ? getSchemaOrgType(categorySlugs) : 'Thing'

  const { ratingValue, ratingCount } = computeRatingStats(topicMetrics)
  const topicSchema =
    ratingCount > 0
      ? createAggregateRatingSchema({
          name: `${getTopicDisplayTitle(topic)} ${section.label}`,
          description: createExcerpt(topic.html ?? topic.markdown),
          path: pagePath,
          schemaOrgType,
          ratingValue,
          ratingCount,
        })
      : createTopicSchema({
          name: `${getTopicDisplayTitle(topic)} ${section.label}`,
          description: createExcerpt(topic.html ?? topic.markdown),
          path: pagePath,
          schemaOrgType,
        })

  return {
    topic: topicSchema,
    breadcrumbs: createBreadcrumbSchema(
      buildBreadcrumbsForPath(topicPath, {
        isAuthenticated: false,
        tail: [
          { name: getTopicDisplayTitle(topic), path: topicPath },
          { name: section.label, path: pagePath },
        ],
      }),
      t,
    ),
  }
}

export function createTopicReviewSectionStructuredData(
  t: Translator,
  topic: Topic,
  topicTypeSlug: string,
  topicMetrics: TopicMetrics | null,
  reviewsLabel: string,
  categorySlugs?: string[],
) {
  const topicPath = `/${topicTypeSlug}/${topic.slug}`
  const reviewPath = `/${topicTypeSlug}/${topic.slug}/reviews`
  const schemaOrgType = categorySlugs ? getSchemaOrgType(categorySlugs) : 'Thing'

  const { ratingValue, ratingCount } = computeRatingStats(topicMetrics)

  const topicSchema =
    ratingCount > 0
      ? createAggregateRatingSchema({
          name: `${getTopicDisplayTitle(topic)} ${reviewsLabel}`,
          description: createExcerpt(topic.html ?? topic.markdown),
          path: reviewPath,
          schemaOrgType,
          ratingValue,
          ratingCount,
        })
      : createTopicSchema({
          name: `${getTopicDisplayTitle(topic)} ${reviewsLabel}`,
          description: createExcerpt(topic.html ?? topic.markdown),
          path: reviewPath,
          schemaOrgType,
        })

  return {
    topic: topicSchema,
    breadcrumbs: createBreadcrumbSchema(
      buildBreadcrumbsForPath(topicPath, {
        isAuthenticated: false,
        tail: [
          { name: getTopicDisplayTitle(topic), path: topicPath },
          { name: reviewsLabel, path: reviewPath },
        ],
      }),
      t,
    ),
  }
}

export function computeRatingStats(topicMetrics: TopicMetrics | null | undefined): {
  ratingValue: number
  ratingCount: number
} {
  if (!topicMetrics?.ratings?.count) return { ratingValue: 0, ratingCount: 0 }
  const counts = topicMetrics.ratings.count
  const ratingCount =
    (counts['1'] || 0) +
    (counts['2'] || 0) +
    (counts['3'] || 0) +
    (counts['4'] || 0) +
    (counts['5'] || 0)
  const numerator =
    (1 * counts['1'] || 0) +
    (2 * counts['2'] || 0) +
    (3 * counts['3'] || 0) +
    (4 * counts['4'] || 0) +
    (5 * counts['5'] || 0)
  const ratingValue = ratingCount > 0 ? Math.round((numerator / ratingCount) * 10) / 10 : 0
  return { ratingValue, ratingCount }
}

interface AggregateRatingSchemaOptions {
  name: string
  description?: string
  path: string
  schemaOrgType: string
  ratingValue: number
  ratingCount: number
}

function createAggregateRatingSchema({
  name,
  description,
  path,
  schemaOrgType,
  ratingValue,
  ratingCount,
}: AggregateRatingSchemaOptions): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': schemaOrgType,
    name,
    ...(description ? { description } : {}),
    url: buildAbsoluteUrl(path),
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue,
      ratingCount,
      bestRating: 5,
      worstRating: 1,
    },
  }
}
