import { beginTransaction, write } from '@data-stores/psql'
import { captureAutotaggerAgentCandidateTopicIds } from '../../../../services/autotagger/agent/candidates.mts'
import { createAutotaggerAgentRunAdapter } from '../../../../services/autotagger/index.mts'
import {
  hasCompletedClassifierRun,
  requestClassifierRuns,
  requestFollowOnClassifierRun,
  settleClassifierRunRequest,
  type ClassifierRunRequestSettlement,
  type ClassifierRunSubject,
} from '../../../../services/classifier-runs/index.mts'
import {
  AUTOTAGGER_AGENT_SLUG,
  type claimAutotaggerAgentLease,
} from './autotagger-agent-fixture.mts'

/** What the request helpers read from a post or feed item fixture. */
type RequestFixture = { subject: ClassifierRunSubject; inputSha256: Buffer }

/** The request a producer would write for the reasoning pass, as the sweep and dispatcher see it. */
export function requestAutotaggerAgentRun(fixture: RequestFixture) {
  return requestClassifierRuns(write, {
    subject: fixture.subject,
    inputSha256: fixture.inputSha256,
    classifierSlugs: [AUTOTAGGER_AGENT_SLUG],
  })
}

/** The follow-on request a first-stage completion writes, for any classifier slug. */
export function requestFollowOnForTest(
  fixture: RequestFixture,
  classifierSlug: string = AUTOTAGGER_AGENT_SLUG,
) {
  return requestFollowOnClassifierRun(write, {
    subject: fixture.subject,
    inputSha256: fixture.inputSha256,
    classifierSlug,
  })
}

/** Settles the reasoning pass's request the way the dispatcher and the sweep do. */
export function settleAutotaggerAgentRequestForTest(
  fixture: RequestFixture,
  settlement: ClassifierRunRequestSettlement,
) {
  return settleClassifierRunRequest(write, AUTOTAGGER_AGENT_SLUG, fixture.subject, settlement)
}

/** Whether a current run of the classifier completed at exactly the given content. */
export function hasCompletedClassifierRunForTest(input: {
  subject: ClassifierRunSubject
  inputSha256: Buffer
  classifierSlug: string
}) {
  return hasCompletedClassifierRun(write, input)
}

/** The candidate topic ids the reasoning pass would capture for the subject, or null for no work. */
export function captureAutotaggerAgentCandidatesForTest(subject: ClassifierRunSubject) {
  return captureAutotaggerAgentCandidateTopicIds(write, subject)
}

/** Applies a lease's effects with no remote decision persisted, in a transaction that rolls back. */
export async function applyAutotaggerAgentEffectsWithoutDecisionForTest(
  lease: Awaited<ReturnType<typeof claimAutotaggerAgentLease>>,
) {
  const adapter = createAutotaggerAgentRunAdapter()
  await using query = await beginTransaction()
  return await adapter.applyEffects(query, lease, { local: null, remoteDecision: null })
}
