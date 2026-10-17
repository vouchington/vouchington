import type { Post } from '@services/posts'
import { externalText, sanitizedTitle } from './mcp-read-output.mts'

const SOURCE = 'post'
type Rating = NonNullable<Post['review_topic_ratings']>[number]

const sanitizedAll = <T,>(items: T[] | undefined, sanitize: (item: T) => Promise<T>) =>
  items && Promise.all(items.map(sanitize))

async function sanitizedRating(rating: Rating): Promise<Rating> {
  const { topic } = rating
  if (!topic) return rating
  const markdown = await externalText(topic.markdown, 'topic', 'topic_markdown')
  return {
    ...rating,
    topic: { ...topic, name: await sanitizedTitle(topic.name), markdown: markdown ?? '' },
  }
}

/** Sanitize every free-text field on the full moderation Post without projecting away its fields. */
async function sanitizedPostText(post: Post): Promise<Partial<Post>> {
  const [summary, clearanceReason, html, images, hashtags, categories, relatedTopics, ratings] =
    await Promise.all([
      externalText(post.ai_summary_markdown, SOURCE, 'ai_summary_markdown'),
      externalText(post.clearance_reason, SOURCE, 'clearance_reason'),
      post.html === undefined ? undefined : externalText(post.html, SOURCE, 'html'),
      sanitizedAll(post.images, async image => ({
        ...image,
        caption: await sanitizedTitle(image.caption),
      })),
      sanitizedAll(post.post_hashtags, async tag => ({
        ...tag,
        key: await sanitizedTitle(tag.key),
        display_token: await sanitizedTitle(tag.display_token),
      })),
      sanitizedAll(post.post_explicit_categories, async category =>
        category.type === 'topic'
          ? { ...category, topic_name: await sanitizedTitle(category.topic_name) }
          : { ...category, hashtag: await sanitizedTitle(category.hashtag) },
      ),
      sanitizedAll(post.post_related_topics, async topic => ({
        ...topic,
        name: await sanitizedTitle(topic.name),
      })),
      post.review_topic_ratings && Promise.all(post.review_topic_ratings.map(sanitizedRating)),
    ])
  return {
    ai_summary_markdown: summary ?? '',
    clearance_reason: clearanceReason,
    ...(html === undefined ? {} : { html: html ?? '' }),
    ...(images === undefined ? {} : { images }),
    ...(hashtags === undefined ? {} : { post_hashtags: hashtags }),
    ...(categories === undefined ? {} : { post_explicit_categories: categories }),
    ...(relatedTopics === undefined ? {} : { post_related_topics: relatedTopics }),
    ...(ratings === undefined ? {} : { review_topic_ratings: ratings }),
  }
}

/** Preserve typed data-point values while fencing its one user-authored free-text field. */
async function sanitizedStructuredData(value: unknown): Promise<unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const data = value as Record<string, unknown>
  if (data['vertical'] !== 'bank_account' || typeof data['bonus_requirements'] !== 'string')
    return value
  return {
    ...data,
    bonus_requirements: await externalText(
      data['bonus_requirements'],
      'post',
      'bonus_requirements',
    ),
  }
}

/** Keep the full Post contract; sanitize text rather than pruning data the moderator needs. */
export async function sanitizePendingPost(
  post: Post | null | undefined,
): Promise<Post | null | undefined> {
  if (!post) return post
  const [postText, structuredData] = await Promise.all([
    sanitizedPostText(post),
    sanitizedStructuredData(post.structured_data),
  ])
  const recommendation = post.topic_recommendation
  const recommendationText = recommendation
    ? {
        topic_recommendation: {
          ...recommendation,
          topic_title: await sanitizedTitle(recommendation.topic_title),
          topic_markdown: await externalText(
            recommendation.topic_markdown,
            'post',
            'topic_markdown',
          ),
          aliases: await Promise.all(recommendation.aliases.map(sanitizedTitle)),
          rejection_reason: await externalText(
            recommendation.rejection_reason,
            'post',
            'rejection_reason',
          ),
          approval_error_message: await externalText(
            recommendation.approval_error_message,
            'post',
            'approval_error_message',
          ),
        },
      }
    : {}
  return {
    ...post,
    ...postText,
    ...(structuredData !== post.structured_data ? { structured_data: structuredData } : {}),
    ...recommendationText,
  }
}
