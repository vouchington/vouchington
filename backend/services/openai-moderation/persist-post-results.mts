import {
  completePostModerationAttempt,
  ensureCurrentPostModerationVersion,
  recordPostModerationDisposition,
  type PostModerationAttempt,
} from '@services/post-clearance/moderation-ledger'
import type { PersistableOpenAIModerationResults } from './stored-results.mts'

export async function applyPostOpenAIModerationResults(
  postId: string,
  contentSha256: Buffer,
  results: PersistableOpenAIModerationResults,
  flagged: boolean,
  attempt?: PostModerationAttempt,
): Promise<boolean> {
  const version = attempt ?? (await ensureCurrentPostModerationVersion(postId))
  if (!version.content_sha256.equals(contentSha256)) return false

  const sexualMinors = hasSexualMinorsSignal(results)
  const disposition = sexualMinors ? 'reject' : flagged ? 'review' : 'pass'
  const reasonCode = sexualMinors ? 'sexual_minors' : flagged ? 'provider_flagged' : 'provider_pass'
  const evidence = { flagged_categories: getFlaggedCategories(results) }

  if (attempt) {
    return completePostModerationAttempt(attempt, { disposition, reasonCode, evidence })
  }
  return recordPostModerationDisposition({
    versionId: 'version_id' in version ? version.version_id : version.id,
    source: 'openai_omni',
    disposition,
    reasonCode,
    evidence,
  })
}

/** Marks an empty post's OpenAI moderation pass so the clearance gate can proceed. */
export async function markPostOpenAIModerationNoContent(
  postId: string,
  attempt?: PostModerationAttempt,
): Promise<boolean> {
  const version = attempt ?? (await ensureCurrentPostModerationVersion(postId))
  if (attempt) {
    return completePostModerationAttempt(attempt, {
      disposition: 'pass',
      reasonCode: 'no_content_to_moderate',
    })
  }
  return recordPostModerationDisposition({
    versionId: 'version_id' in version ? version.version_id : version.id,
    source: 'openai_omni',
    disposition: 'pass',
    reasonCode: 'no_content_to_moderate',
  })
}

function hasSexualMinorsSignal(results: PersistableOpenAIModerationResults): boolean {
  return asResultObjects(results).some(result => {
    const categories = result.categories
    return isRecord(categories) && categories['sexual/minors'] === true
  })
}

function getFlaggedCategories(results: PersistableOpenAIModerationResults): string[] {
  const categories = new Set<string>()
  for (const result of asResultObjects(results)) {
    if (!isRecord(result.categories)) continue
    for (const [name, flagged] of Object.entries(result.categories)) {
      if (flagged === true) categories.add(name)
    }
  }
  return [...categories].sort().slice(0, 100)
}

function asResultObjects(results: PersistableOpenAIModerationResults): Record<string, unknown>[] {
  if (Array.isArray(results)) return results.filter(isRecord)
  return isRecord(results) ? [results] : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
