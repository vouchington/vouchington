import type { runDataRetentionCleanup } from '@services/data-retention'

export function unfinishedClassifierSweeps(
  result: Awaited<ReturnType<typeof runDataRetentionCleanup>>['classifierRecords'],
): string[] {
  const has = (sweep: keyof typeof result) => result[sweep]?.hasMore ?? false
  const children = has('runCandidates') || has('agentTopics') || has('localOutcomes')
  const runs = has('runs') || children
  const results =
    runs || has('topicResults') || has('storyResults') || has('communityPromptResults')
  const candidates = results || has('decisionCandidates')
  const calls = candidates || has('calls')
  const batches = calls || has('batches')
  const requests = runs || has('requests')
  const identities = requests || has('deletedSubjectIdentities')
  return (
    [
      ['runCandidates', has('runCandidates')],
      ['agentTopics', has('agentTopics')],
      ['localOutcomes', has('localOutcomes')],
      ['runs', runs],
      ['topicResults', runs || has('topicResults')],
      ['storyResults', runs || has('storyResults')],
      ['communityPromptResults', runs || has('communityPromptResults')],
      ['decisionCandidates', candidates],
      ['calls', calls],
      ['batches', batches],
      ['requests', requests],
      ['deletedSubjectIdentities', identities],
      ['versionedIdentities', has('versionedIdentities')],
    ] as const
  ).flatMap(([sweep, pending]) => (pending ? [sweep] : []))
}

const MEMBERSHIP_FAMILIES = [
  'deliveredMembershipEntitlementEffects',
  'endedMembershipRenewalNotices',
  'terminalGooglePlayAcknowledgments',
] as const

export function unfinishedMembershipFamilies(
  result: Awaited<ReturnType<typeof runDataRetentionCleanup>>,
): string[] {
  return MEMBERSHIP_FAMILIES.filter(family => result[family]?.hasMore)
}
