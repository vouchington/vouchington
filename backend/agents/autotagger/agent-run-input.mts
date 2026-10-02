import type { ClassifierRunRemoteInput } from '@agents/classifier-runs'
import {
  classifierPrompt,
  classifierStructuralText,
  sanitizeClassifierExternalContentParts,
  type ClassifierSafeText,
} from '@agents/classifiers/safe-content'
import {
  readAutotaggerAppliedTopicNames,
  readAutotaggerCandidateTopics,
  type AutotaggerAgentRunConfiguration,
} from '@services/autotagger'
import type { ClassifierRunLease } from '@services/classifier-runs'
import { buildAutotaggerBindings } from './classifier-run-bindings.mts'

/** The subject's content followed by the topics it already has, each name sanitized as a title. */
async function withAppliedTopics(
  state: ClassifierSafeText,
  appliedTopicNames: readonly string[],
): Promise<ClassifierSafeText> {
  const applied =
    appliedTopicNames.length === 0
      ? classifierStructuralText('(none)')
      : await sanitizeClassifierExternalContentParts(
          appliedTopicNames.map(name => ({ content: name, isTitle: true })),
          ', ',
          { source: 'topics', contentType: 'applied_topics' },
        )
  return classifierPrompt`${state}\n\nTopics already applied to this content:\n${applied}`
}

/**
 * C7's remote input: one yes/no question per paid-followed topic the run captured when its receipt
 * was reserved, asked over the subject's classifier state plus the topics it already has. Reading
 * the captured topics (not a fresh search) is what keeps a retry, lease reclaim or replay asking the
 * same question set it first reserved. Null when every captured topic has since been deleted: with
 * no question to ask, the run has no remote work and completes without a provider call.
 */
export async function buildAutotaggerAgentRunInput(
  lease: ClassifierRunLease<AutotaggerAgentRunConfiguration>,
  state: ClassifierSafeText,
): Promise<ClassifierRunRemoteInput | null> {
  const { remote, configuration } = lease.resolved
  if (remote?.candidateKind !== 'topic' || !remote.capturedCandidates)
    throw new Error('autotagger agent run must capture its own candidates')
  if (lease.capturedTopicIds.length === 0) return null
  const [topics, appliedTopicNames] = await Promise.all([
    readAutotaggerCandidateTopics(lease.capturedTopicIds),
    readAutotaggerAppliedTopicNames(lease.subject),
  ])
  return {
    classifierId: remote.classifierId,
    promptVersionId: remote.promptVersionId,
    subject: lease.subject,
    scope: remote.scope,
    state: await withAppliedTopics(state, appliedTopicNames),
    bindings: await buildAutotaggerBindings(configuration.prompt, topics),
  }
}
