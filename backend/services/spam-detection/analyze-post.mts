import type { Post } from '@services/posts/types'
import { createPostModerationContent } from '@services/posts/content'
import { SPAM_SCORE_THRESHOLD, SIGNAL_WEIGHTS } from './config.mts'
import {
  checkExcessiveLinks,
  checkSpamKeywords,
  checkContentHashDuplicate,
  checkLowQualityText,
  checkEmbeddingsSimilarity,
  checkReferralLinkInPost,
} from './spam-signals.mts'
import type { SpamDetectionResult } from './types.mts'

export async function analyzePostForSpam(post: Post): Promise<SpamDetectionResult> {
  const markdown = post.markdown ?? ''
  const title = post.title ?? ''
  const userId = post.created_by_id ?? ''

  const { content_sha256 } = createPostModerationContent(post)

  const [
    excessiveLinks,
    spamKeywords,
    contentHashDuplicate,
    lowQualityText,
    embeddingsSimilarity,
    referralLinkInPost,
  ] = await Promise.all([
    checkExcessiveLinks(markdown),
    checkSpamKeywords(title, markdown),
    userId
      ? checkContentHashDuplicate(content_sha256, userId)
      : Promise.resolve({
          signal: 'content_hash_duplicate',
          score: 0,
          flagged: false,
          details: { skipped: true },
        }),
    checkLowQualityText(markdown),
    userId
      ? checkEmbeddingsSimilarity(post.id, userId)
      : Promise.resolve({
          signal: 'embeddings_similarity',
          score: 0,
          flagged: false,
          details: { skipped: true },
        }),
    checkReferralLinkInPost(markdown),
  ])

  const signals = [
    excessiveLinks,
    spamKeywords,
    contentHashDuplicate,
    lowQualityText,
    embeddingsSimilarity,
    referralLinkInPost,
  ]

  const composite_score =
    excessiveLinks.score * SIGNAL_WEIGHTS.excessive_links +
    spamKeywords.score * SIGNAL_WEIGHTS.spam_keywords +
    contentHashDuplicate.score * SIGNAL_WEIGHTS.content_hash_duplicate +
    lowQualityText.score * SIGNAL_WEIGHTS.low_quality_text +
    embeddingsSimilarity.score * SIGNAL_WEIGHTS.embeddings_similarity +
    referralLinkInPost.score * SIGNAL_WEIGHTS.referral_link_in_post

  const flagged = composite_score >= SPAM_SCORE_THRESHOLD

  return { signals, composite_score, flagged }
}
