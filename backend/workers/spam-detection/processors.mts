import { getPostByAny } from '@services/posts/get'
import { createPostModerationContent } from '@services/posts/content'
import { analyzePostForSpam, applyPostSpamDetectionResults } from '@services/spam-detection'
import { penalizeReferralLinkInPost } from '@services/vote-integrity'
import {
  beginPostModerationAttempt,
  checkPostClearance,
  failPostModerationAttempt,
} from '@services/post-clearance'

export async function processSpamDetection(
  postId: string,
  expectedContentSha256?: string,
): Promise<boolean> {
  const post = await getPostByAny(postId, { readOnly: false })
  if (!post) return false

  const { content_sha256 } = createPostModerationContent(post)
  if (expectedContentSha256 && expectedContentSha256 !== content_sha256.toString('hex')) {
    return false
  }
  const attempt = await beginPostModerationAttempt(postId, 'spam_detection')
  if (!attempt || !attempt.content_sha256.equals(content_sha256)) return false

  try {
    const result = await analyzePostForSpam(post)
    const applied = await applyPostSpamDetectionResults(postId, content_sha256, result, attempt)
    if (!applied) return false

    // Apply vote penalty for referral links (immediate, idempotent per post)
    const referralSignal = result.signals.find(s => s.signal === 'referral_link_in_post')
    if (referralSignal?.flagged && post.created_by_id) {
      await penalizeReferralLinkInPost(post.created_by_id, postId)
    }

    await checkPostClearance(postId)
    return true
  } catch (error) {
    const failure = await failPostModerationAttempt(attempt, classifyModerationError(error))
    if (failure.exhausted) await checkPostClearance(postId)
    throw error
  }
}

function classifyModerationError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code.slice(0, 100)
  }
  return error instanceof Error ? error.name.slice(0, 100) : 'unknown_error'
}
