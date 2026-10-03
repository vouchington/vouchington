import type { TopicRecommendationPost } from '@services/topic-recommendations'
import { externalText, sanitizedTitle } from './mcp-read-output.mts'

const SOURCE = 'topic_recommendation'

type PostText = Pick<
  TopicRecommendationPost,
  | 'ai_summary_markdown'
  | 'clearance_reason'
  | 'html'
  | 'images'
  | 'post_hashtags'
  | 'post_explicit_categories'
  | 'post_related_topics'
  | 'review_topic_ratings'
>

type Rating = NonNullable<TopicRecommendationPost['review_topic_ratings']>[number]

/** A rating's topic: no recommendation post carries ratings, but nothing in the type says so. */
async function sanitizedRating(rating: Rating): Promise<Rating> {
  const { topic } = rating
  if (!topic) return rating
  const markdown = await externalText(topic.markdown, 'topic', 'topic_markdown')
  return {
    ...rating,
    topic: { ...topic, name: await sanitizedTitle(topic.name), markdown: markdown ?? '' },
  }
}

const sanitizedAll = <T,>(items: T[] | undefined, sanitize: (item: T) => Promise<T>) =>
  items && Promise.all(items.map(sanitize))

/**
 * The text a post carries beside the recommendation's own fields, sanitized or, when it is long,
 * fenced as external content: the AI summary and the rendered HTML (both made from the submitter's
 * words), the clearance reason, image captions, and the hashtags and topics attached to the post.
 * Topic names and hashtags are written by other users too, whoever attached them. Ids, slugs and
 * timestamps keep the formats the service validated. Fields the post does not carry stay absent.
 */
export async function sanitizedPostText(post: TopicRecommendationPost): Promise<Partial<PostText>> {
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
  const text: Partial<PostText> = {
    ai_summary_markdown: summary ?? '',
    clearance_reason: clearanceReason,
    html: html === undefined ? undefined : (html ?? ''),
    images,
    post_hashtags: hashtags,
    post_explicit_categories: categories,
    post_related_topics: relatedTopics,
    review_topic_ratings: ratings,
  }
  return Object.fromEntries(
    Object.entries(text).filter(([, value]) => value !== undefined),
  ) as Partial<PostText>
}
