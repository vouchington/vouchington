import {
  completePostModerationAttempt,
  ensureCurrentPostModerationVersion,
  recordPostModerationDisposition,
  type PostModerationAttempt,
} from '@services/post-clearance/moderation-ledger'
import type { SpamDetectionResult } from './types.mts'

export async function applyPostSpamDetectionResults(
  postId: string,
  inputSha256: Buffer,
  result: SpamDetectionResult,
  attempt?: PostModerationAttempt,
): Promise<boolean> {
  const version = attempt ?? (await ensureCurrentPostModerationVersion(postId))
  if (!version.content_sha256.equals(inputSha256)) return false

  const disposition = result.flagged ? 'review' : 'pass'
  const reasonCode = result.flagged ? 'spam_signal' : 'provider_pass'
  const evidence = {
    composite_score: result.composite_score,
    signals: result.signals.slice(0, 100).map(signal => ({
      signal: signal.signal,
      score: signal.score,
      flagged: signal.flagged,
    })),
  }
  if (attempt) {
    return completePostModerationAttempt(attempt, { disposition, reasonCode, evidence })
  }
  return recordPostModerationDisposition({
    versionId: 'version_id' in version ? version.version_id : version.id,
    source: 'spam_detection',
    disposition,
    reasonCode,
    evidence,
  })
}
