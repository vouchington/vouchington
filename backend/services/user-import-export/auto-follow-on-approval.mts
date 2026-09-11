import { read, write } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import {
  getEntityRelationMetadataOrThrow,
  type EntityRelationMetadata,
} from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { getPrivateUsersByAnyBatch, type PrivateUser } from '@services/users'
import onError from '@modules/on-error'

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
  await autoFollowRecommendationRequests({
    findPendingQuery: sql`/* autoFollowOnRecommendationApproval:findPending */
      SELECT id, user_id
      FROM user_import_requests
      WHERE topic_recommendation_post_id = ${recommendationPostId}
        AND followed_at IS NULL
    `,
    relation: followTopicRelation,
    objectId: topicId,
    buildMarkFollowedQuery: requestIds => sql`/* autoFollowOnRecommendationApproval:markFollowed */
        UPDATE user_import_requests
        SET topic_id = ${topicId},
            followed_at = CURRENT_TIMESTAMP
        WHERE id = ANY(${requestIds})
      `,
  })
}

type PendingImportRequest = {
  id: string
  user_id: string
}

type AutoFollowRecommendationRequestsOptions = {
  findPendingQuery: SQLStatement
  relation: EntityRelationMetadata
  objectId: string
  buildMarkFollowedQuery: (requestIds: string[]) => SQLStatement
}

async function autoFollowRecommendationRequests({
  findPendingQuery,
  relation,
  objectId,
  buildMarkFollowedQuery,
}: AutoFollowRecommendationRequestsOptions): Promise<void> {
  const { rows } = await read(findPendingQuery)
  const requests = rows as PendingImportRequest[]

  if (requests.length === 0) return

  try {
    const users = await getPrivateUsersByAnyBatch(requests.map(request => request.user_id))
    const usersById = new Map(
      users.flatMap(user => (isPrivateUser(user) ? [[user.id, user] as const] : [])),
    )
    const validRequests = await followRequestsWithBoundedConcurrency(requests, usersById, {
      relation,
      objectId,
    })

    if (validRequests.length > 0) {
      await write(buildMarkFollowedQuery(validRequests.map(request => request.id)))
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}

function followRequestsWithBoundedConcurrency(
  requests: PendingImportRequest[],
  usersById: Map<string, PrivateUser>,
  relationTarget: Pick<AutoFollowRecommendationRequestsOptions, 'relation' | 'objectId'>,
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
  { relation, objectId }: Pick<AutoFollowRecommendationRequestsOptions, 'relation' | 'objectId'>,
): Promise<PendingImportRequest | null> {
  try {
    const user = usersById.get(request.user_id)
    if (!user) return null

    await upsertEntityRelation(user, relation, { id: request.user_id }, [{ id: objectId }])
    return request
  } catch (error) {
    const followError = error instanceof Error ? error : new Error(String(error))
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
