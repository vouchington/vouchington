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

export type RemotePlan = TopicRemotePlan | CommunityPromptRemotePlan

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
   * reserved; a later search result can never change them. Null or empty means no work.
   */
  captureCandidates?(
    query: OwnedTransaction,
    subject: ClassifierRunSubject,
    current: CurrentClassifierRunInput,
  ): Promise<readonly string[] | null>
  /** Reservation-time prerequisite (for example an embedding); false leaves the request unsettled. */
  ready?(query: OwnedTransaction, subject: ClassifierRunSubject): Promise<boolean>
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
