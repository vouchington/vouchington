import { followImportedTopics } from './import-topics-follow.mts'
import { TopicImportInProgressError } from './topic-import-errors.mts'
export { TopicImportInProgressError } from './topic-import-errors.mts'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import onError from '@modules/on-error'
import {
  findTopicsBySlugOrName,
  prepareTopicInput,
  recordTopicImportRequests,
  type TopicImportAudit,
} from './import-topics-queries.mts'
import { admitImportedTopicRecommendation } from './admit-topic-recommendation.mts'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating'
import { claimTopicImportAttempt, finalizeTopicImportAttempt } from './topic-import-attempts.mts'
import type { ImportTopicResult } from './import-topics-types.mts'
export type { ImportTopicResult } from './import-topics-types.mts'
export { claimTopicImportAttempt } from './topic-import-attempts.mts'

const MAX_IMPORT_ITEMS = 500
export async function importTopics(
  currentUser: PrivateUser,
  provenance: ContentProvenance,
  names: string[],
  options: {
    assertCanCreateTopicRecommendations: () => Promise<void>
    importAttemptId: string
    callerCanReplayIdempotencyIdentity?: boolean
    membershipPlan?: ContributionLimitMembershipPlan
    recordImportRequests?: typeof recordTopicImportRequests
  },
): Promise<ImportTopicResult[]> {
  assert(names.length <= MAX_IMPORT_ITEMS, 400, 'At most 500 topics')
  const attempt = await claimTopicImportAttempt(currentUser.id, options.importAttemptId, names)
  if (attempt.response) return attempt.response
  const inputs = names.map((rawName, index) => prepareTopicInput(rawName, index))
  const results: Array<ImportTopicResult | undefined> = []
  const validInputs = inputs.filter(input => {
    if (!input.error) return true
    results[input.index] = { input: input.rawName, status: 'error', error: input.error }
    return false
  })

  const existingTopics = await findTopicsBySlugOrName(validInputs)
  const existingInputs = validInputs.filter(input => existingTopics.has(input.index))
  const existingTopicIds = [...new Set(existingTopics.values())]
  const audits: TopicImportAudit[] = []
  const newInputs = validInputs.filter(input => !existingTopics.has(input.index))
  let recommendationGateError: Error | null = null
  let inProgressError: TopicImportInProgressError | null = null
  if (newInputs.length > 0) {
    try {
      await options.assertCanCreateTopicRecommendations()
    } catch (err) {
      recommendationGateError = err instanceof Error ? err : new Error(String(err))
    }
  }
  for (const input of newInputs) {
    try {
      if (recommendationGateError) throw recommendationGateError
      // oxlint-disable-next-line no-await-in-loop -- preserve per-input contribution checks and ordered result attribution
      const admission = await admitImportedTopicRecommendation(
        currentUser,
        provenance,
        input,
        options.membershipPlan ?? null,
        options.importAttemptId,
        options.callerCanReplayIdempotencyIdentity ?? true,
      )
      if (admission.kind === 'in_progress') {
        inProgressError = new TopicImportInProgressError(admission.retryAfterSeconds)
        break
      }
      const recommendation = admission.response
      results[input.index] = {
        input: input.rawName,
        status: 'recommendation_created',
        recommendation_post_id: recommendation.id,
      }
      audits.push({
        index: input.index,
        inputValue: input.name,
        recommendationPostId: recommendation.id,
      })
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
      results[input.index] = {
        input: input.rawName,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  }

  if (inProgressError) {
    await (options.recordImportRequests ?? recordTopicImportRequests)(currentUser.id, audits)
    throw inProgressError
  }

  return finalizeTopicImportAttempt(attempt.id, query =>
    followImportedTopics(currentUser, query, {
      inputs,
      existingInputs,
      existingTopics,
      existingTopicIds,
      audits,
      results,
      recordImportRequests: options.recordImportRequests ?? recordTopicImportRequests,
    }),
  )
}
