import type { ClassifierRunRemoteInput } from '@agents/classifier-runs'
import type { ClassifierSafeText } from '@agents/classifiers/safe-content'
import type { ClassifierRunLease } from '@services/classifier-runs'
import type { CommunityModerationRunConfiguration } from '@services/community-agent-prompts'
import { buildCommunityModerationBindings } from './classifier-run-bindings.mts'

/**
 * C8's remote input: one yes/no question per prompt the run's configuration pinned, asked over
 * the post's content in a single call. Reading the pinned prompts (not the community's current
 * ones) is what keeps a retry, lease reclaim or replay asking the exact question set whose
 * configuration identity the receipt is keyed on, so a rule edited mid-flight never changes it.
 */
export async function buildCommunityModerationRunInput(
  lease: ClassifierRunLease<CommunityModerationRunConfiguration>,
  state: ClassifierSafeText,
): Promise<ClassifierRunRemoteInput> {
  const { remote, configuration } = lease.resolved
  if (remote?.candidateKind !== 'community_prompt') {
    throw new Error('community moderation run must use community prompt candidates')
  }
  return {
    classifierId: remote.classifierId,
    promptVersionId: remote.promptVersionId,
    subject: lease.subject,
    scope: remote.scope,
    state,
    bindings: await buildCommunityModerationBindings(configuration.prompt, configuration.prompts),
  }
}
