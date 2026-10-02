import type { OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { capturesCandidates } from './remote-plan.mts'
import type {
  ClassifierRunAdapter,
  ClassifierRunSubject,
  CurrentClassifierRunInput,
  ResolvedClassifierRun,
  StoryRunCandidate,
} from './types.mts'

export type CapturedCandidates = {
  topicIds: readonly string[]
  storyCandidates: readonly StoryRunCandidate[]
}

const NO_CAPTURED_CANDIDATES: CapturedCandidates = { topicIds: [], storyCandidates: [] }

/**
 * The candidates a new receipt captures, or null when the classifier finds none. An identity that
 * already has a receipt keeps the set it captured, so the search never runs a second time and a
 * changed result can never change what the run asks. Pinned-candidate runs capture nothing.
 */
export async function captureRunCandidates<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  query: OwnedTransaction,
  subject: ClassifierRunSubject,
  current: CurrentClassifierRunInput,
  resolved: ResolvedClassifierRun<C>,
): Promise<CapturedCandidates | null> {
  const storyRun = resolved.remote?.candidateKind === 'story'
  if (!capturesCandidates(resolved.remote) && !storyRun) return NO_CAPTURED_CANDIDATES
  if (storyRun ? !adapter.captureStoryCandidates : !adapter.captureCandidates) {
    throw new Error(`Classifier ${adapter.slug} captures candidates without a capture hook`)
  }
  const subjectMatch =
    subject.postId !== null
      ? sql`post_id = ${subject.postId}`
      : sql`rss_feed_item_id = ${subject.rssFeedItemId}`
  const { rows } = await query(
    sql`/* reserveClassifierRun.existing */
    SELECT 1 FROM classifier_runs
    WHERE classifier_id = (SELECT id FROM classifiers WHERE slug = ${adapter.slug})
      AND input_sha256 = ${current.inputSha256}
      AND configuration_sha256 = ${resolved.configurationSha256} AND `.append(subjectMatch),
  )
  if (rows.length > 0) return NO_CAPTURED_CANDIDATES
  if (storyRun) {
    const candidates = await adapter.captureStoryCandidates?.(query, subject, current)
    return candidates && candidates.length > 0
      ? { topicIds: [], storyCandidates: dedupeStoryCandidates(candidates) }
      : null
  }
  const topicIds = await adapter.captureCandidates?.(query, subject, current)
  return topicIds && topicIds.length > 0
    ? { topicIds: [...new Set(topicIds)], storyCandidates: [] }
    : null
}

function dedupeStoryCandidates(candidates: readonly StoryRunCandidate[]): StoryRunCandidate[] {
  const seen = new Set<string>()
  return candidates.filter(candidate => {
    const key = `${candidate.kind}:${candidate.kind === 'story' ? candidate.storyId : candidate.rssFeedItemId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
