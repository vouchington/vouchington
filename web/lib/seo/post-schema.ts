import { buildAbsoluteUrl, SITE_NAME } from './constants'
import type { StructuredDataValue } from './structured-data'

interface CommentSchema {
  authorName?: string
  datePublished: string
  text: string
}

export interface InteractionStats {
  upvotes?: number
  commentCount?: number
}

interface PostSchemaOptions {
  kind: 'review' | 'article' | 'blog-post' | 'discussion' | 'comment' | 'data-point'
  title: string
  description: string
  path: string
  createdAt: string
  updatedAt: string
  authorName?: string | null
  authorUrl?: string
  imagePath?: string
  reviewRating?: number
  itemName?: string
  itemReviewedType?: string
  comments?: CommentSchema[]
  interactionStats?: InteractionStats
  articleSection?: string
  keywords?: string | string[]
  inLanguage?: string
}

function buildAuthor(
  authorName: string | null | undefined,
  authorUrl: string | undefined,
): Record<string, unknown> {
  if (!authorName) {
    return { author: { '@type': 'Organization', name: SITE_NAME, url: buildAbsoluteUrl('/') } }
  }
  const absoluteAuthorUrl = authorUrl ? buildAbsoluteUrl(authorUrl) : undefined
  return {
    author: {
      '@type': 'Person',
      name: authorName,
      ...(absoluteAuthorUrl ? { '@id': absoluteAuthorUrl, url: absoluteAuthorUrl } : {}),
    },
  }
}

export function createPostSchema({
  kind,
  title,
  description,
  path,
  createdAt,
  updatedAt,
  authorName,
  authorUrl,
  imagePath,
  reviewRating,
  itemName,
  itemReviewedType,
  comments,
  interactionStats,
  articleSection,
  keywords,
  inLanguage,
}: PostSchemaOptions): StructuredDataValue {
  const author = buildAuthor(authorName, authorUrl)

  if (kind === 'review' || typeof reviewRating === 'number') {
    return {
      '@context': 'https://schema.org',
      '@type': 'Review',
      name: title,
      reviewBody: description,
      datePublished: createdAt,
      dateModified: updatedAt,
      url: buildAbsoluteUrl(path),
      ...author,
      ...(itemName
        ? { itemReviewed: { '@type': itemReviewedType ?? 'Thing', name: itemName } }
        : {}),
      ...(typeof reviewRating === 'number'
        ? {
            reviewRating: {
              '@type': 'Rating',
              ratingValue: reviewRating,
              bestRating: 5,
              worstRating: 1,
            },
          }
        : {}),
      ...(imagePath ? { image: buildAbsoluteUrl(imagePath) } : {}),
    }
  }

  if (kind === 'article' || kind === 'blog-post') {
    const keywordsValue = Array.isArray(keywords) ? keywords.join(',') : keywords
    return {
      '@context': 'https://schema.org',
      '@type': kind === 'blog-post' ? 'BlogPosting' : 'Article',
      headline: title,
      description,
      datePublished: createdAt,
      dateModified: updatedAt,
      url: buildAbsoluteUrl(path),
      ...author,
      ...(imagePath ? { image: buildAbsoluteUrl(imagePath) } : {}),
      ...(articleSection ? { articleSection } : {}),
      ...(keywordsValue ? { keywords: keywordsValue } : {}),
      ...(inLanguage ? { inLanguage } : {}),
    }
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: title,
    text: description,
    datePublished: createdAt,
    dateModified: updatedAt,
    url: buildAbsoluteUrl(path),
    discussionUrl: buildAbsoluteUrl(path),
    ...author,
    ...(imagePath ? { image: buildAbsoluteUrl(imagePath) } : {}),
    ...buildCommentSchema(comments),
    ...buildInteractionStatistics(interactionStats),
  }
}

function buildCommentSchema(
  comments?: CommentSchema[],
): { comment: StructuredDataValue[] } | Record<string, never> {
  if (!comments?.length) return {}
  return {
    comment: comments.map(c => ({
      '@type': 'Comment',
      text: c.text,
      datePublished: c.datePublished,
      ...(c.authorName ? { author: { '@type': 'Person', name: c.authorName } } : {}),
    })),
  }
}

function buildInteractionStatistics(
  stats?: InteractionStats,
): { interactionStatistic: StructuredDataValue[] } | Record<string, never> {
  if (!stats) return {}
  const result: StructuredDataValue[] = []

  if (typeof stats.upvotes === 'number') {
    result.push({
      '@type': 'InteractionCounter',
      interactionType: { '@type': 'LikeAction' },
      userInteractionCount: stats.upvotes,
    })
  }
  if (typeof stats.commentCount === 'number') {
    result.push({
      '@type': 'InteractionCounter',
      interactionType: { '@type': 'CommentAction' },
      userInteractionCount: stats.commentCount,
    })
  }

  if (result.length === 0) return {}
  return { interactionStatistic: result }
}
