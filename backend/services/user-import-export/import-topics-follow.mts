import type { TransactionQuery } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import {
  prepareBookmarkActions,
  upsertPreparedBookmarkActions,
} from '@services/entity-relation-actions'
import {
  withAvailableRelationCapacity,
  isRelationLimitError,
} from '@services/entity-relations/relation-limits'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { clientErrorMessage } from './topic-import-errors.mts'
import type {
  PreparedTopicInput,
  TopicImportAudit,
  recordTopicImportRequests,
} from './import-topics-queries.mts'
import type { ImportTopicResult } from './import-topics-types.mts'

export async function followImportedTopics(
  currentUser: PrivateUser,
  query: TransactionQuery,
  {
    inputs,
    existingInputs,
    existingTopics,
    existingTopicIds,
    audits,
    results,
    recordImportRequests,
  }: {
    inputs: PreparedTopicInput[]
    existingInputs: PreparedTopicInput[]
    existingTopics: Map<number, string>
    existingTopicIds: string[]
    audits: TopicImportAudit[]
    results: Array<ImportTopicResult | undefined>
    recordImportRequests: typeof recordTopicImportRequests
  },
): Promise<ImportTopicResult[]> {
  let prepared: Awaited<ReturnType<typeof prepareBookmarkActions>>
  try {
    prepared = await prepareBookmarkActions(
      currentUser,
      { kind: 'first_party' },
      existingTopicIds.map(topicId => ({
        entityType: 'topic',
        entityId: topicId,
        predicate: 'follow',
      })),
    )
  } catch (err) {
    const message = clientErrorMessage(err)
    if (message === undefined) throw err
    prepared = existingTopicIds.map(() => ({ status: 'rejected' as const, reason: err }))
  }
  const authorized = new Map<
    string,
    Extract<(typeof prepared)[number], { status: 'fulfilled' }>['value']
  >()
  for (const [index, result] of prepared.entries()) {
    const topicId = existingTopicIds[index]!
    if (result.status === 'fulfilled') {
      authorized.set(topicId, result.value)
      continue
    }
    const message = clientErrorMessage(result.reason)
    if (message === undefined) throw result.reason
    for (const input of existingInputs) {
      if (existingTopics.get(input.index) === topicId)
        results[input.index] = { input: input.rawName, status: 'error', error: message }
    }
  }
  const authorizedInputs = existingInputs.filter(input =>
    authorized.has(existingTopics.get(input.index)!),
  )
  return withAvailableRelationCapacity(
    currentUser.id,
    {
      relation: getEntityRelationMetadataOrThrow({
        subjectType: 'user',
        objectType: 'topic',
        predicate: 'follow',
      }),
      objectIds: [...authorized.keys()],
    },
    async (limitState, allowedIds) => {
      const followedTopicIds = new Set(limitState?.existingObjectIds ?? [])
      const skippedTopicIds = new Set<string>()
      const followedDuringImport = new Set<string>()
      const topicIdsToFollow: string[] = []
      for (const input of authorizedInputs) {
        const topicId = existingTopics.get(input.index)!
        const alreadyFollowing = followedTopicIds.has(topicId) || followedDuringImport.has(topicId)
        if (!alreadyFollowing && (skippedTopicIds.has(topicId) || !allowedIds.has(topicId))) {
          skippedTopicIds.add(topicId)
          results[input.index] = {
            input: input.rawName,
            status: 'skipped',
            error_code: 'RELATION_LIMIT_REACHED',
            entity_id: topicId,
          }
          continue
        }
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
      await recordImportRequests(currentUser.id, audits, query)

      try {
        await upsertPreparedBookmarkActions(
          currentUser,
          topicIdsToFollow.map(topicId => authorized.get(topicId)!),
        )
        for (const input of existingInputs) {
          const topicId = existingTopics.get(input.index)!
          if (results[input.index]?.status === 'followed') {
            audits.push({ index: input.index, inputValue: input.name, topicId })
          }
        }
      } catch (err) {
        const message = clientErrorMessage(err)
        if (message === undefined) throw err
        for (const input of existingInputs) {
          if (!topicIdsToFollow.includes(existingTopics.get(input.index)!)) continue
          results[input.index] = isRelationLimitError(err)
            ? { input: input.rawName, status: 'skipped', error_code: 'RELATION_LIMIT_REACHED' }
            : { input: input.rawName, status: 'error', error: message }
        }
      }

      const followAudits = audits.slice(auditsBeforeFollows)
      if (followAudits.length > 0) {
        await recordImportRequests(currentUser.id, followAudits, query)
      }

      return results.map(
        (result, index) =>
          result ?? {
            input: inputs[index]!.rawName,
            status: 'error' as const,
            error: 'Import did not complete',
          },
      )
    },
  )
}
