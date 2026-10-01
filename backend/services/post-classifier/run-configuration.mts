import type { ResolvedClassifierRun } from '@services/classifier-runs'
import type { resolvePostClassifierConfiguration } from './configuration.mts'

type ResolvedPostClassifier = NonNullable<
  Awaited<ReturnType<typeof resolvePostClassifierConfiguration>>
>

export type PostClassifierConfiguration = ResolvedPostClassifier['configuration']

/** Maps the C5 configuration snapshot onto the shared run's replay identity and remote plan. */
export function toResolvedClassifierRun(
  resolved: ResolvedPostClassifier,
): ResolvedClassifierRun<PostClassifierConfiguration> {
  const { configuration } = resolved
  return {
    configuration,
    configurationJson: resolved.configurationJson,
    configurationSha256: resolved.configurationSha256,
    actorId: configuration.actorId,
    remote: configuration.remote && {
      classifierId: configuration.remote.classifierId,
      promptVersionId: configuration.remote.promptVersionId,
      scope: { scopeCategory: 'global', scopeCommunityId: null },
      candidateKind: 'topic',
      capturedCandidates: false,
      candidates: configuration.remote.questions.map(question => ({
        topicId: question.topicId,
        candidateId: question.candidateId,
        thresholdId: question.thresholdId,
        lower: question.lower,
        upper: question.upper,
      })),
    },
  }
}
