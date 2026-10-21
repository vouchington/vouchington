import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import { upsertBookmarkAction } from '@services/entity-relation-actions'
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
import type { ImportTopicResult } from './import-topics-types.mts'
export type { ImportTopicResult } from './import-topics-types.mts'

const MAX_IMPORT_ITEMS = 500

export class TopicImportInProgressError extends Error {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super('Topic recommendation is in progress')
    this.name = 'TopicImportInProgressError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function clientErrorMessage(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('status' in err)) return undefined
  const status = (err as { status: unknown }).status
  if (typeof status !== 'number' || status < 400 || status >= 500) return undefined
  return err instanceof Error ? err.message : 'Unknown error'
}

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

  return finalizeTopicImportAttempt(attempt.id, async query => {
    const followedTopicIds = await getFollowedTopicIds(currentUser.id, existingTopicIds, query)
    const followedDuringImport = new Set<string>()
    const topicIdsToFollow: string[] = []
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
        topicIdsToFollow.push(topicId)
      }
    }

    const auditsBeforeFollows = audits.length
    await (options.recordImportRequests ?? recordTopicImportRequests)(currentUser.id, audits, query)

    // oxlint-disable no-await-in-loop -- bookmarkEntity applies the follow side effects per topic
    for (const topicId of topicIdsToFollow) {
      try {
        // no-mistakes-disable-next-line query-reached-per-item: each topic applies the vouch rate limit and relation metrics
        await upsertBookmarkAction(
          currentUser,
          { kind: 'first_party' },
          { entityType: 'topic', entityId: topicId, predicate: 'follow' },
        )
        for (const input of existingInputs) {
          if (existingTopics.get(input.index) !== topicId) continue
          audits.push({ index: input.index, inputValue: input.name, topicId })
        }
      } catch (err) {
        const message = clientErrorMessage(err)
        if (message === undefined) throw err
        for (const input of existingInputs) {
          if (existingTopics.get(input.index) !== topicId) continue
          results[input.index] = { input: input.rawName, status: 'error', error: message }
        }
      }
    }
    // oxlint-enable no-await-in-loop

    const followAudits = audits.slice(auditsBeforeFollows)
    if (followAudits.length > 0) {
      await (options.recordImportRequests ?? recordTopicImportRequests)(
        currentUser.id,
        followAudits,
        query,
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
