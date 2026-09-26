import { createHash } from 'node:crypto'
import {
  getContributionPolicyConfigSnapshot,
  createContributionPolicyActor,
  executePreparedContribution,
  resolveContributionDailyOnlyPolicy,
  runContributionAdmission,
  type ContributionLimitMembershipPlan,
} from '@services/contribution-gating'
import { prepareTopicRecommendation } from '@services/topic-recommendations'
import type { BasicUser } from '@services/users/types'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'

export async function admitImportedTopicRecommendation(
  provenance: ContentProvenance,
  currentUser: BasicUser,
  input: { name: string; slug: string },
  membershipPlan: ContributionLimitMembershipPlan,
  importAttemptId: string,
  callerCanReplayIdempotencyIdentity = true,
) {
  const recommendationInput = {
    topic_title: input.name,
    topic_slug: input.slug,
    markdown: `Imported topic: ${input.name}`,
  }
  const capacityExempt = currentUser.roles.includes('administrator')
  const policy = capacityExempt
    ? undefined
    : resolveContributionDailyOnlyPolicy(
        getContributionPolicyConfigSnapshot(),
        createContributionPolicyActor(currentUser.id, membershipPlan),
        'topic_recommendation',
      )
  return runContributionAdmission({
    actorId: currentUser.id,
    idempotencyKey: stableTopicImportIdempotencyKey(currentUser.id, importAttemptId, input.slug),
    callerCanReplayIdempotencyIdentity,
    intent: { route: 'my.import.topics.recommendation', ...recommendationInput },
    policy,
    source: 'topic_recommendation',
    capacityExempt,
    audit: {
      route: 'my.import.topics.recommendation',
      scope: 'my.import.topics',
      source: 'topic_recommendation',
      postType: 'topic_recommendation',
      policyRevision: capacityExempt
        ? 'capacity-exempt'
        : createHash('sha256').update(JSON.stringify(policy)).digest('hex'),
    },
    execute: query =>
      executePreparedContribution(query, () =>
        prepareTopicRecommendation(provenance, currentUser, recommendationInput, { query }),
      ),
  })
}

/** UUID-shaped identity stable for one actor's retry of one slug within one import attempt. */
export function stableTopicImportIdempotencyKey(
  actorId: string,
  importAttemptId: string,
  topicSlug: string,
): string {
  const hash = createHash('sha256')
    .update(`topic-import-recommendation:${actorId}:${importAttemptId}:${topicSlug}`)
    .digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}
