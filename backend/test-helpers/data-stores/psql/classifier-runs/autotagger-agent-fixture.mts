import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { AUTOTAGGER_AGENT_SLUG } from '@voucha/types/entities/autotagger-agent'
import type { MembershipPlanSlug, MembershipStatus } from '@voucha/types/entities/membership'
import sql from 'sql-template-strings'
import {
  createAutotaggerAgentRunAdapter,
  createAutotaggerRunAdapter,
} from '../../../../services/autotagger/index.mts'
import {
  claimClassifierRun,
  completeClassifierRun,
  persistClassifierRunOutcomes,
  reserveClassifierRun,
  type ClassifierRunAdapter,
  type ClassifierRunLease,
  type ClassifierRunSubject,
} from '../../../../services/classifier-runs/index.mts'
import { createTestMembership, createTestUser } from '../../../index.mts'
import { createSystemUser } from '../../../entities/users.mts'
import { softDeleteUser } from '../../../entities/users-lifecycle.mts'
import { claimAutotaggerLease, requestAutotaggerRun } from './autotagger-fixture.mts'

export { AUTOTAGGER_AGENT_SLUG }

type FollowerOptions = {
  /** The follower's membership plan; null gives a follower with no membership at all. */
  plan?: MembershipPlanSlug | null
  status?: MembershipStatus
  /** Role slugs the follower holds, such as `moderator`. */
  roles?: string[]
  /** A reserved system account rather than a person. */
  system?: boolean
  /** The account was deleted after it followed. */
  deletedUser?: boolean
  /** The follow itself was removed. */
  deletedFollow?: boolean
}

/** A user who follows the topic, with the membership, roles and lifecycle the options describe. */
export async function followTopicAsReader(topicId: string, options: FollowerOptions = {}) {
  const { plan = 'plus', status, roles = [], system = false } = options
  const user = system
    ? await createSystemUser(`system-follower-${randomUUID().slice(0, 12)}`)
    : await createTestUser({ extraRoles: roles })
  if (plan) await createTestMembership({ user_id: user.id, plan, ...(status ? { status } : {}) })
  await write(sql`/* followTopicAsReader */
    INSERT INTO relation__user__follow__topic (subject_id, object_id, created_by_id, deleted_at)
    VALUES (${user.id}, ${topicId}, ${user.id}, ${options.deletedFollow ? new Date() : null})
  `)
  if (options.deletedUser) await softDeleteUser(user.id)
  return user
}

/**
 * Persists a provider answer for every topic the run captured, as the executor does after the one
 * provider call: `answers` maps a topic id to its probability (0.9 applies it, 0.1 rejects it), and
 * a topic it leaves out is answered 0.1. A run with nothing captured persists no decision.
 */
export async function persistTopicRunAnswers<C, E>(
  adapter: ClassifierRunAdapter<C, never, E>,
  lease: ClassifierRunLease<C>,
  answers: Readonly<Record<string, number>> = {},
) {
  const remote = lease.resolved.remote
  if (!remote || lease.decisionBatchId === null) throw new Error('Expected a remote run')
  const results = lease.capturedTopicIds.map(topicId => {
    const probability = answers[topicId] ?? 0.1
    return {
      candidateKind: 'topic' as const,
      topicId,
      storedCandidateId: null,
      probability,
      rawResponse: { probability },
    }
  })
  return persistClassifierRunOutcomes(adapter, {
    lease,
    ...(results.length === 0
      ? {}
      : {
          remoteDecision: {
            batchId: lease.decisionBatchId,
            classifierId: remote.classifierId,
            promptVersionId: remote.promptVersionId,
            subject: lease.subject,
            scope: remote.scope,
            calls: [{ shardOrdinal: 0, results }],
          },
        }),
  })
}

/**
 * Runs C6 to completion for the subject, as the worker does: reserve, answer, apply. The
 * completion transaction is what writes C7's durable request, so this is how a test reaches "C6
 * produced its result".
 */
export async function completeTaggingRunForTest(
  fixture: Parameters<typeof requestAutotaggerRun>[0],
  answers: Readonly<Record<string, number>> = {},
) {
  const adapter = createAutotaggerRunAdapter()
  const lease = await claimAutotaggerLease(fixture)
  await persistTopicRunAnswers(adapter, lease, answers)
  const completed = await completeClassifierRun(adapter, lease)
  if (completed.kind !== 'completed') throw new Error(`Expected completion, got ${completed.kind}`)
  return { lease, effects: completed.effects }
}

/** Reserves C7's run for the subject (the dispatcher's step) and returns its live lease. */
export async function claimAutotaggerAgentLease(subject: ClassifierRunSubject) {
  const adapter = createAutotaggerAgentRunAdapter()
  const reserved = await reserveClassifierRun(adapter, subject)
  if (reserved.kind !== 'reserved') throw new Error(`Expected a reservation, got ${reserved.kind}`)
  const { run } = reserved
  const claim = await claimClassifierRun(adapter, {
    runId: run.runId,
    subject: run.subject,
    inputSha256: run.inputSha256,
    configurationSha256: run.configurationSha256,
    leaseSeconds: 60,
  })
  if (claim.kind !== 'claimed') throw new Error(`Expected a claim, got ${claim.kind}`)
  return claim.lease
}

/** Marks a run superseded, as the sweep does when its configuration or content moved on. */
export async function supersedeClassifierRunForTest(runId: string): Promise<void> {
  await write(sql`/* supersedeClassifierRunForTest */
    UPDATE classifier_runs SET superseded_at = clock_timestamp() WHERE id = ${runId}
  `)
}
