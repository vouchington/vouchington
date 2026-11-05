import { isRelationLimitError } from '@services/entity-relations/relation-limits'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  getEntityRelationMetadataOrThrow,
  type EntityRelationMetadata,
} from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { getPrivateUsersByAnyBatch, type PrivateUser } from '@services/users'
import onError from '@modules/on-error'
import { getUserImportExportConfig } from './config.mts'

const AUTO_FOLLOW_RELATION_UPSERT_CONCURRENCY = 10

const followTopicRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'user',
  objectType: 'topic',
  predicate: 'follow',
})

export async function autoFollowOnRecommendationApproval(
  recommendationPostId: string,
  topicId: string,
): Promise<void> {
  const batchSize = getUserImportExportConfig().import_status_page_size
  let cursor: string | null = null
  // Approval must process the full set in this call; each read and write is bounded.
  for (;;) {
    const pageQuery = sql`/* autoFollowOnRecommendationApproval:findPending */
      SELECT id, user_id
      FROM user_import_requests
      WHERE topic_recommendation_post_id = ${recommendationPostId}
        AND followed_at IS NULL
    `
    if (cursor) pageQuery.append(sql` AND id > ${cursor}::uuid`)
    pageQuery.append(sql` ORDER BY id LIMIT ${batchSize}`)
    /* oxlint-disable no-await-in-loop -- the keyset cursor from the preceding page selects this page */
    // no-mistakes-disable-next-line query-reached-per-item: each read selects one validated ID-keyset page; invalid users are passed by the cursor and all pages must be attempted
    const { rows } = await read(pageQuery)
    /* oxlint-enable no-await-in-loop */
    const requests = rows as PendingImportRequest[]
    if (requests.length === 0) return
    cursor = requests.at(-1)!.id

    try {
      /* oxlint-disable no-await-in-loop -- this page's users must be loaded before its follows are attempted */
      // no-mistakes-disable-next-line query-reached-per-item: one batch user lookup per bounded request page, not one lookup per import
      const users = await getPrivateUsersByAnyBatch(requests.map(request => request.user_id))
      /* oxlint-enable no-await-in-loop */
      const usersById = new Map(
        users.flatMap(user => (isPrivateUser(user) ? [[user.id, user] as const] : [])),
      )

      /* oxlint-disable no-await-in-loop -- this page's follows must settle before its successful IDs are written */
      // no-mistakes-disable-next-line query-reached-per-item: each bounded request page preserves per-user relation authorization and rate limits with bounded concurrency
      const validRequests = await followRequestsWithBoundedConcurrency(requests, usersById, {
        relation: followTopicRelation,
        objectId: topicId,
      })
      /* oxlint-enable no-await-in-loop */

      if (validRequests.length > 0) {
        const requestIds = validRequests.map(request => request.id)

        /* oxlint-disable no-await-in-loop -- this page's successful IDs must be marked before reading the next page */
        // no-mistakes-disable-next-line query-reached-per-item: one update by the successful ID array for the current bounded page
        await write(sql`/* autoFollowOnRecommendationApproval:markFollowed */
          UPDATE user_import_requests
          SET topic_id = ${topicId},
              followed_at = CURRENT_TIMESTAMP
          WHERE id = ANY(${requestIds})
        `)
        /* oxlint-enable no-await-in-loop */
      }
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
      return
    }
  }
}

type PendingImportRequest = {
  id: string
  user_id: string
}

type AutoFollowRecommendationTarget = {
  relation: EntityRelationMetadata
  objectId: string
}

function followRequestsWithBoundedConcurrency(
  requests: PendingImportRequest[],
  usersById: Map<string, PrivateUser>,
  relationTarget: AutoFollowRecommendationTarget,
): Promise<PendingImportRequest[]> {
  const validRequests: PendingImportRequest[] = []

  return chunkRequests(requests).reduce<Promise<PendingImportRequest[]>>(
    async (previousRequests, requestChunk) => {
      await previousRequests
      const chunkResults = await Promise.all(
        requestChunk.map(request => followRequest(request, usersById, relationTarget)),
      )
      validRequests.push(...chunkResults.filter(isPendingImportRequest))
      return validRequests
    },
    Promise.resolve(validRequests),
  )
}

async function followRequest(
  request: PendingImportRequest,
  usersById: Map<string, PrivateUser>,
  { relation, objectId }: AutoFollowRecommendationTarget,
): Promise<PendingImportRequest | null> {
  try {
    const user = usersById.get(request.user_id)
    if (!user) return null

    await upsertEntityRelation(user, relation, { id: request.user_id }, [{ id: objectId }])
    return request
  } catch (err) {
    if (isRelationLimitError(err)) return null
    const followError = err instanceof Error ? err : new Error(String(err))
    onError(followError)
    return null
  }
}

function isPrivateUser(user: PrivateUser | null | undefined): user is PrivateUser {
  return user != null
}

function isPendingImportRequest(
  request: PendingImportRequest | null,
): request is PendingImportRequest {
  return request != null
}

function chunkRequests(requests: PendingImportRequest[]): PendingImportRequest[][] {
  const chunks: PendingImportRequest[][] = []

  for (let index = 0; index < requests.length; index += AUTO_FOLLOW_RELATION_UPSERT_CONCURRENCY) {
    chunks.push(requests.slice(index, index + AUTO_FOLLOW_RELATION_UPSERT_CONCURRENCY))
  }

  return chunks
}
