import type { BasicUser } from '@services/users/types'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import onError from '@modules/on-error'
import {
  findTopicsBySlugOrName,
  getFollowedTopicIds,
  prepareTopicInput,
  recordTopicImportRequests,
  type TopicImportAudit,
} from './import-topics-queries.mts'
import { admitImportedTopicRecommendation } from './admit-topic-recommendation.mts'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating'
import { claimTopicImportAttempt, finalizeTopicImportAttempt } from './topic-import-attempts.mts'

export type ImportTopicResult = {
  input: string
  status: 'followed' | 'recommendation_created' | 'already_following' | 'error'
  error?: string
  entity_id?: string
  recommendation_post_id?: string
}

const MAX_IMPORT_ITEMS = 500

export class TopicImportInProgressError extends Error {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super('Topic recommendation is in progress')
    this.name = 'TopicImportInProgressError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

const followTopicRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'user',
  objectType: 'topic',
  predicate: 'follow',
})

export async function importTopics(
  currentUser: BasicUser,
  names: string[],
  options: {
    assertCanCreateTopicRecommendations: () => Promise<void>
    importAttemptId: string
    callerCanReplayIdempotencyIdentity?: boolean
    membershipPlan?: ContributionLimitMembershipPlan
    recordImportRequests?: typeof recordTopicImportRequests
  },
): Promise<ImportTopicResult[]> {
  const effectiveNames = names.length > MAX_IMPORT_ITEMS ? names.slice(0, MAX_IMPORT_ITEMS) : names
  const attempt = await claimTopicImportAttempt(
    currentUser.id,
    options.importAttemptId,
    effectiveNames,
  )
  if (attempt.response) return attempt.response
  const inputs = effectiveNames.map((rawName, index) => prepareTopicInput(rawName, index))
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
    } catch (error) {
      recommendationGateError = error instanceof Error ? error : new Error(String(error))
    }
  }
  for (const input of newInputs) {
    try {
      if (recommendationGateError) throw recommendationGateError
      // oxlint-disable-next-line no-await-in-loop -- preserve per-input contribution checks and ordered result attribution
      const admission = await admitImportedTopicRecommendation(
        currentUser,
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
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
      results[input.index] = {
        input: input.rawName,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  if (inProgressError) {
    await (options.recordImportRequests ?? recordTopicImportRequests)(currentUser.id, audits)
    throw inProgressError
  }

  return finalizeTopicImportAttempt(attempt.id, async query => {
    const followedTopicIds = await getFollowedTopicIds(currentUser.id, existingTopicIds, query)
    const followedDuringImport = new Set<string>()
    for (const input of existingInputs) {
      const topicId = existingTopics.get(input.index)!
      const alreadyFollowing = followedTopicIds.has(topicId) || followedDuringImport.has(topicId)
      results[input.index] = {
        input: input.rawName,
        status: alreadyFollowing ? 'already_following' : 'followed',
        entity_id: topicId,
      }
      if (!alreadyFollowing) {
        followedDuringImport.add(topicId)
        audits.push({ index: input.index, inputValue: input.name, topicId })
      }
    }

    const topicIdsToFollow = existingTopicIds.filter(topicId => !followedTopicIds.has(topicId))
    await (options.recordImportRequests ?? recordTopicImportRequests)(currentUser.id, audits, query)
    if (topicIdsToFollow.length > 0) {
      await upsertEntityRelation(
        currentUser,
        followTopicRelation,
        { id: currentUser.id },
        topicIdsToFollow.map(id => ({ id })),
        { query },
      )
    }

    return results.map(
      (result, index) =>
        result ?? {
          input: inputs[index]!.rawName,
          status: 'error' as const,
          error: 'Import did not complete',
        },
    )
  })
}
