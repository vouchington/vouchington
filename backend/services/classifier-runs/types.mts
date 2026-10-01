import type { OwnedTransaction, QueryExecutor } from '@data-stores/psql'
import type {
  ClassifierDecisionScope,
  PersistedClassifierDecision,
} from '@services/classifiers/types'
import type { SQLStatement } from 'sql-template-strings'

/** Exactly one of the two subject columns is set. */
export type ClassifierRunSubject =
  | { postId: string; rssFeedItemId: null }
  | { postId: null; rssFeedItemId: string }

/** One exact remote candidate and pinned threshold snapshot of a run's reserved decision batch. */
export type RemoteCandidate = {
  topicId: string
  candidateId: string
  thresholdId: string
  lower: number
  upper: number
}

type RemotePlanBase = {
  classifierId: string
  promptVersionId: string
  /** The scope of the run's decision batch; every remote input and persisted result must carry it. */
  scope: ClassifierDecisionScope
}

/** Topic candidates, pinned by the configuration or captured when the receipt is reserved. */
export type TopicRemotePlan = RemotePlanBase & {
  candidateKind: 'topic'
  /** Candidates and thresholds pinned by the configuration; empty when the run captures its own. */
  candidates: readonly RemoteCandidate[]
  /** True when the run's topic candidates are captured at reservation instead of pinned. */
  capturedCandidates: boolean
}

/**
 * Community moderation prompts, pinned by the configuration. They have no stored candidate or
 * threshold revision: every result carries the prompt version's default thresholds.
 */
export type CommunityPromptRemotePlan = RemotePlanBase & {
  candidateKind: 'community_prompt'
  promptIds: readonly string[]
}

/** One story-clustering candidate: an existing story, or a standalone RSS item. */
export type StoryRunCandidate =
  | { kind: 'story'; storyId: string }
  | { kind: 'rss_feed_item'; rssFeedItemId: string }

/**
 * Story-clustering candidates, always captured when the receipt is reserved. They have no stored
 * candidate or threshold revision: every result carries the prompt version's default thresholds.
 */
export type StoryRemotePlan = RemotePlanBase & { candidateKind: 'story' }

export type RemotePlan = TopicRemotePlan | CommunityPromptRemotePlan | StoryRemotePlan

/** The replay snapshot of one classifier's configuration for a subject, produced by its adapter. */
export type ResolvedClassifierRun<C> = {
  configuration: C
  /** PostgreSQL-canonical JSONB text; its SHA-256 is the configuration identity. */
  configurationJson: string
  configurationSha256: Buffer
  actorId: string
  /** Null for a local-only run, which never reserves a provider attempt. */
  remote: RemotePlan | null
}

/** The subject's current content, read under the subject's own lock. */
export type CurrentClassifierRunInput = { inputSha256: Buffer; communityId: string | null }

export type ClassifierRunOutcomes<L> = {
  local: L | null
  remoteDecision: PersistedClassifierDecision | null
}

/** Exclusive, fenced claim on one run; every later lifecycle write must present it. */
export type ClassifierRunLease<C> = {
  runId: string
  subject: ClassifierRunSubject
  inputSha256: Buffer
  resolved: ResolvedClassifierRun<C>
  leaseToken: string
  decisionBatchId: string | null
  /** The candidate topics the run captured at reservation, in order; empty for pinned candidates. */
  capturedTopicIds: readonly string[]
  /** The story candidates the run captured at reservation, in order; empty for a topic run. */
  capturedStoryCandidates: readonly StoryRunCandidate[]
}

/**
 * The only per-classifier code: how a subject's current input is read and its configuration
 * resolved, plus how durable outcomes become effects. Receipt, lease, reclaim, attempt reservation
 * and cap, terminal failure, completion, supersession, dispatch and sweep are shared.
 *
 * C = configuration snapshot, L = optional local (non-provider) outcome, E = applied-effect summary.
 */
export type ClassifierRunAdapter<C, L = never, E = void> = {
  slug: string
  /** Locks the subject; null when it is no longer eligible for this classifier. */
  lockCurrent(
    query: OwnedTransaction,
    subject: ClassifierRunSubject,
  ): Promise<CurrentClassifierRunInput | null>
  /** Null means no work is configured; a throw means the configuration is unresolvable for now. */
  resolve(
    subject: ClassifierRunSubject,
    current: CurrentClassifierRunInput,
    query?: QueryExecutor,
  ): Promise<ResolvedClassifierRun<C> | null>
  /**
   * Chooses the topic candidates of a run that captures its own, once, when its receipt is first
   * reserved; a later search result can never change them. Null or empty means no work. It runs
   * before the subject lock is taken, so it reads on its own connection and must not rely on the
   * lock; the reservation keeps its result only if the content and configuration it was chosen for
   * are still current under the lock.
   */
  captureCandidates?(
    query: QueryExecutor,
    subject: ClassifierRunSubject,
    current: CurrentClassifierRunInput,
  ): Promise<readonly string[] | null>
  /**
   * The story-clustering counterpart of `captureCandidates`: stories and standalone items. It has
   * the same contract: it runs before the subject lock on its own connection, and the reservation
   * keeps its result only if the content and configuration it was chosen for are still current
   * under the lock.
   */
  captureStoryCandidates?(
    query: QueryExecutor,
    subject: ClassifierRunSubject,
    current: CurrentClassifierRunInput,
  ): Promise<readonly StoryRunCandidate[] | null>
  /**
   * Reservation-time prerequisite (for example an embedding); false leaves the request unsettled.
   * It runs both before and under the subject lock, so it must be a pure read.
   */
  ready?(query: QueryExecutor, subject: ClassifierRunSubject): Promise<boolean>
  /** SQL over `request` (classifier_run_requests) selecting only requests the sweep may dispatch. */
  requestEligibility(): SQLStatement
  /** Throws unless `local` is present exactly when the configuration asks for one. */
  validateLocal?(configuration: C, local: L | undefined): void
  persistLocal?(query: OwnedTransaction, lease: ClassifierRunLease<C>, local: L): Promise<void>
  readLocal?(query: QueryExecutor, runId: string): Promise<L | null>
  applyEffects(
    query: OwnedTransaction,
    lease: ClassifierRunLease<C>,
    outcomes: ClassifierRunOutcomes<L>,
  ): Promise<E>
}

export type ClassifierRunFailureKind = 'provider-error' | 'invalid-result' | 'context-rejected'
