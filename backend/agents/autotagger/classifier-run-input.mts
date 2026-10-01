import type { ClassifierRunRemoteInput } from '@agents/classifier-runs'
import type { ClassifierSafeText } from '@agents/classifiers/safe-content'
import {
  readAutotaggerCandidateTopics,
  type AutotaggerRunConfiguration,
} from '@services/autotagger'
import type { ClassifierRunLease } from '@services/classifier-runs'
import { buildAutotaggerBindings } from './classifier-run-bindings.mts'

/**
 * C6's remote input: one yes/no question per topic the run captured when its receipt was reserved,
 * asked over the subject's classifier state. Reading the captured topics (not a fresh search) is
 * what keeps a retry, lease reclaim or replay asking the same question set it first reserved.
 * Null when every captured topic has since been hard-deleted: with no question to ask, the run
 * has no remote work and completes without a provider call.
 */
export async function buildAutotaggerRunInput(
  lease: ClassifierRunLease<AutotaggerRunConfiguration>,
  state: ClassifierSafeText,
): Promise<ClassifierRunRemoteInput | null> {
  const { remote, configuration } = lease.resolved
  if (remote?.candidateKind !== 'topic' || !remote.capturedCandidates)
    throw new Error('tagging run must capture its own candidates')
  if (lease.capturedTopicIds.length === 0) return null
  const topics = await readAutotaggerCandidateTopics(lease.capturedTopicIds)
  const bindings = await buildAutotaggerBindings(configuration.prompt, topics)
  return {
    classifierId: remote.classifierId,
    promptVersionId: remote.promptVersionId,
    subject: lease.subject,
    scope: remote.scope,
    state,
    bindings,
  }
}
