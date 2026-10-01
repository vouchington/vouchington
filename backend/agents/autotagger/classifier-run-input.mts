import type { ClassifierRunRemoteInput } from '@agents/classifier-runs'
import {
  renderClassifierCandidateQuestion,
  type ClassifierSafeText,
} from '@agents/classifiers/safe-content'
import type { NoulClassifierBinding } from '@agents/classifiers/types'
import {
  readAutotaggerCandidateTopics,
  type AutotaggerRunConfiguration,
} from '@services/autotagger'
import type { ClassifierRunLease } from '@services/classifier-runs'

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
  if (!remote?.capturedCandidates) throw new Error('tagging run must capture its own candidates')
  if (lease.capturedTopicIds.length === 0) return null
  const topics = await readAutotaggerCandidateTopics(lease.capturedTopicIds)
  const bindings: NoulClassifierBinding[] = await Promise.all(
    topics.map(async topic => ({
      type: 'noul' as const,
      questionId: topic.topicId,
      question: await renderClassifierCandidateQuestion(configuration.prompt, topic.name),
      candidate: {
        candidateKind: 'topic' as const,
        topicId: topic.topicId,
        storedCandidateId: null,
      },
    })),
  )
  return {
    classifierId: remote.classifierId,
    promptVersionId: remote.promptVersionId,
    subject: lease.subject,
    scope: { scopeCategory: 'global', scopeCommunityId: null },
    state,
    bindings,
  }
}
