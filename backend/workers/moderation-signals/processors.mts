import { getPostByAny } from '@services/posts/get'
import { createPostModerationContent } from '@services/posts/content'
import { analyzePostForSpam, applyPostSpamDetectionResults } from '@services/spam-detection'
import { penalizeReferralLinkInPost } from '@services/vote-integrity'
import {
  checkPostClearance,
  readCurrentAutomatedPostModerationAttempt,
} from '@services/post-clearance'

export async function processSpamDetection(versionId: string): Promise<boolean> {
  const attempt = await readCurrentAutomatedPostModerationAttempt(versionId, 'spam_detection')
  if (!attempt) return false
  const post = await getPostByAny(attempt.post_id, { readOnly: false })
  if (!post) return false
  const { content_sha256 } = createPostModerationContent(post)
  if (!attempt.content_sha256.equals(content_sha256)) return false

  const result = await analyzePostForSpam(post)
  const applied = await applyPostSpamDetectionResults(post.id, content_sha256, result, attempt)
  if (!applied) return false

  const referralSignal = result.signals.find(signal => signal.signal === 'referral_link_in_post')
  if (referralSignal?.flagged && post.created_by_id) {
    await penalizeReferralLinkInPost(post.created_by_id, post.id)
  }
  await checkPostClearance(post.id)
  return true
}
