import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { capturedCandidateKind } from './remote-plan.mts'
import type {
  ClassifierRunAdapter,
  ClassifierRunSubject,
  CurrentClassifierRunInput,
  RemotePlan,
  ResolvedClassifierRun,
  StoryRunCandidate,
} from './types.mts'

/**
 * How many times a reservation re-prepares its candidates when the subject changes underneath it.
 * A subject edited that fast has no settled content to classify yet, so the reservation gives up as
 * not ready and the request stays for the sweep.
 */
const CLASSIFIER_RUN_RESERVE_ATTEMPTS = 3

/** The candidates a new receipt reserves: topics for a topic run, stories for a story run. */
export type CapturedCandidates = {
  topicIds: readonly string[]
  storyCandidates: readonly StoryRunCandidate[]
}

const NO_CAPTURED_CANDIDATES: CapturedCandidates = { topicIds: [], storyCandidates: [] }

/**
 * Candidates chosen with no subject lock held, with the content and configuration they were chosen
 * for. `captured` is null when the classifier found none.
 */
export type PreparedClassifierCandidates = {
  inputSha256: Buffer
  configurationSha256: Buffer
  captured: CapturedCandidates | null
}

/** Asks for another preparation: the locked subject no longer matches what was prepared. */
export const PREPARE_AGAIN = 'prepare-again'

/**
 * Runs `attempt` with candidates prepared before its lock, again with fresh candidates each time it
 * asks to prepare again, and returns `exhausted` once the bounded attempts are spent. Each attempt
 * ends its transaction before the next preparation starts, so no lock spans a search.
 */
export async function attemptWithPreparedCandidates<C, L, E, R>(
  adapter: ClassifierRunAdapter<C, L, E>,
  subject: ClassifierRunSubject,
  attempt: (prepared: PreparedClassifierCandidates | null) => Promise<R | typeof PREPARE_AGAIN>,
  exhausted: R,
  attemptsLeft: number = CLASSIFIER_RUN_RESERVE_ATTEMPTS,
): Promise<R> {
  if (attemptsLeft <= 0) return exhausted
  const result = await attempt(await prepareClassifierRunCandidates(adapter, subject))
  if (result !== PREPARE_AGAIN) return result
  return attemptWithPreparedCandidates(adapter, subject, attempt, exhausted, attemptsLeft - 1)
}

/**
 * Chooses a new receipt's candidates (topics, or stories for story clustering) before the
 * reservation takes the subject lock, so the vector search and every lookup behind it run with no
 * lock held. Null when there is nothing to prepare: the subject is not live, is not ready, pins its
 * candidates, or already has its receipt. The locked reservation re-reads the subject and uses
 * these candidates only if the content and configuration digests they were chosen for are still
 * the ones it locked.
 */
async function prepareClassifierRunCandidates<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  subject: ClassifierRunSubject,
): Promise<PreparedClassifierCandidates | null> {
  if (!adapter.captureCandidates && !adapter.captureStoryCandidates) return null
  const current = await readCurrentInput(adapter, subject)
  if (!current) return null
  if (adapter.ready && !(await adapter.ready(write, subject, current))) return null
  const resolved = await adapter.resolve(subject, current, write)
  const kind = capturedCandidateKind(resolved?.remote)
  if (!resolved || !kind) return null
  if (await hasClassifierRunReceipt(write, adapter.slug, subject, current, resolved)) return null
  return {
    inputSha256: current.inputSha256,
    configurationSha256: resolved.configurationSha256,
    captured: await searchCandidates(adapter, write, subject, current, kind),
  }
}

/**
 * The candidates a new receipt captures, or null when the classifier finds none. An identity that
 * already has a receipt keeps the set it captured, so the search never runs a second time and a
 * changed result can never change what the run asks. Pinned-candidate runs capture nothing. Runs
 * under the subject lock and never searches: it takes the prepared candidates, or asks to prepare
 * again when none were prepared for the content and configuration it locked.
 */
export async function captureRunCandidates<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  query: QueryExecutor,
  subject: ClassifierRunSubject,
  current: CurrentClassifierRunInput,
  resolved: ResolvedClassifierRun<C>,
  prepared: PreparedClassifierCandidates | null,
): Promise<CapturedCandidates | null | typeof PREPARE_AGAIN> {
  if (!capturedCandidateKind(resolved.remote)) return NO_CAPTURED_CANDIDATES
  requireCaptureHook(adapter, resolved.remote)
  if (await hasClassifierRunReceipt(query, adapter.slug, subject, current, resolved)) {
    return NO_CAPTURED_CANDIDATES
  }
  if (
    !prepared?.inputSha256.equals(current.inputSha256) ||
    !prepared.configurationSha256.equals(resolved.configurationSha256)
  ) {
    return PREPARE_AGAIN
  }
  return prepared.captured
}

/** Runs the adapter's capture hook for the plan's candidate kind; null or empty means none. */
async function searchCandidates<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  query: QueryExecutor,
  subject: ClassifierRunSubject,
  current: CurrentClassifierRunInput,
  kind: 'topic' | 'story',
): Promise<CapturedCandidates | null> {
  if (kind === 'story') {
    const stories = await adapter.captureStoryCandidates?.(query, subject, current)
    return stories && stories.length > 0
      ? { topicIds: [], storyCandidates: dedupeStoryCandidates(stories) }
      : null
  }
  const topicIds = await adapter.captureCandidates?.(query, subject, current)
  return topicIds && topicIds.length > 0
    ? { topicIds: [...new Set(topicIds)], storyCandidates: [] }
    : null
}

function requireCaptureHook<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  remote: RemotePlan | null,
): void {
  const hook =
    remote?.candidateKind === 'story' ? adapter.captureStoryCandidates : adapter.captureCandidates
  if (!hook)
    throw new Error(`Classifier ${adapter.slug} captures candidates without a capture hook`)
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

/** The subject's current input, read under its lock in a transaction that ends immediately. */
async function readCurrentInput<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  subject: ClassifierRunSubject,
): Promise<CurrentClassifierRunInput | null> {
  await using query = await beginTransaction()
  const current = await adapter.lockCurrent(query, subject)
  await query.commit()
  return current
}

async function hasClassifierRunReceipt<C, L, E>(
  query: QueryExecutor,
  slug: ClassifierRunAdapter<C, L, E>['slug'],
  subject: ClassifierRunSubject,
  current: CurrentClassifierRunInput,
  resolved: ResolvedClassifierRun<C>,
): Promise<boolean> {
  const subjectMatch =
    subject.postId !== null
      ? sql`post_id = ${subject.postId}`
      : sql`rss_feed_item_id = ${subject.rssFeedItemId}`
  const { rows } = await query(
    sql`/* reserveClassifierRun.existing */
    SELECT 1 FROM classifier_runs
    WHERE classifier_id = (SELECT id FROM classifiers WHERE slug = ${slug})
      AND input_sha256 = ${current.inputSha256}
      AND configuration_sha256 = ${resolved.configurationSha256} AND `.append(subjectMatch),
  )
  return rows.length > 0
}
