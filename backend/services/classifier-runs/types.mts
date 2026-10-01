import type { OwnedTransaction, QueryExecutor } from '@data-stores/psql'
import type { PersistedClassifierDecision } from '@services/classifiers/types'
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

export type RemotePlan = {
  classifierId: string
  promptVersionId: string
  candidates: readonly RemoteCandidate[]
}

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
    current: CurrentClassifierRunInput,
    query?: QueryExecutor,
  ): Promise<ResolvedClassifierRun<C> | null>
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
