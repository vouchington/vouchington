import { withRelationLimitAdmission } from '@services/entity-relations/relation-limits'
import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import { bookmarkEntities, unbookmarkEntity } from '@services/bookmarks/upsert'
import type {
  EntityRelationEntityType,
  EntityRelationPredicateType,
} from '@services/entity-relations/config'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import { assertNotSuspended } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanBookmarkTarget } from './authorization.mts'
import type { EntityRelationActionAuthority } from './create.mts'
import { assertPostTargetAccess } from './post-target-access.mts'
import { getTopicByAnyWithRedirectCached } from '@services/entity-fetch'

export type BookmarkActionInput = {
  readonly entityType: string
  readonly entityId: string
  readonly predicate: string
}

/** Resolve and authorize each input independently for callers reporting per-target errors. */
export async function prepareBookmarkActions(
  currentUser: PrivateUser,
  authority: EntityRelationActionAuthority,
  inputs: readonly BookmarkActionInput[],
) {
  assertNotSuspended(currentUser)
  return Promise.allSettled(
    inputs.map(async input => {
      const { entityType, entityId, predicate } = input
      assert(isUUID(entityId), 422, 'Invalid entity ID')
      const relation = entityRelationMetadatum.find(
        candidate =>
          candidate.subject_type === 'user' &&
          candidate.object_type === entityType &&
          candidate.predicate === predicate &&
          candidate.is_bookmark,
      )
      assert(relation, 422, 'Invalid bookmark type.')
      const type = entityType as EntityRelationEntityType
      const targetId =
        type === 'topic' ? (await getTopicByAnyWithRedirectCached(entityId))?.topic.id : entityId
      assert(targetId, 404, 'Entity not found')
      assert(
        // no-mistakes-disable-next-line query-reached-per-item: KEEP, work differs per entity type (topic redirect resolution above, then this type-specific currentUserCanBookmarkTarget check); read-only, no lock held across items (runs before relation-limit admission and the batched writes); capped at 500 (SET_BOOKMARK_LIMIT mcp/set-bookmark-batch.mts:26, MAX_IMPORT_ITEMS user-import-export/import-topics.mts:21)
        await currentUserCanBookmarkTarget(currentUser, type, targetId, predicate),
        404,
        'Entity not found',
      )
      let guard: Awaited<ReturnType<typeof assertPostTargetAccess>> | undefined
      if (type === 'post' && authority.kind === 'delegated') {
        // no-mistakes-disable-next-line query-reached-per-item: KEEP, delegated post-access guard is per post (per-target 403/404 consent refusal); read-only, no lock held across items (runs before relation-limit admission and the batched writes); capped at 500 (SET_BOOKMARK_LIMIT mcp/set-bookmark-batch.mts:26)
        guard = await assertPostTargetAccess(currentUser, authority, entityId)
      }
      return {
        userId: currentUser.id,
        relation,
        type,
        targetId,
        predicate: predicate as EntityRelationPredicateType,
        guard,
      }
    }),
  )
}

type PreparedBookmarkAction = Awaited<ReturnType<typeof prepareBookmarkActions>>[number] & {
  status: 'fulfilled'
}
type AuthorizedBookmarkAction = PreparedBookmarkAction['value']

/** Writes authorized targets in relation batches, refusing all capacity checks before writes. */
export async function upsertPreparedBookmarkActions(
  currentUser: PrivateUser,
  prepared: readonly AuthorizedBookmarkAction[],
) {
  assertNotSuspended(currentUser)
  assert(
    prepared.every(item => item.userId === currentUser.id),
    403,
    'Forbidden',
  )
  const groups = new Map<string, AuthorizedBookmarkAction[]>()
  for (const item of prepared) {
    const group = groups.get(item.relation.table_name) ?? []
    group.push(item)
    groups.set(item.relation.table_name, group)
  }
  return withRelationLimitAdmission(
    currentUser.id,
    [...groups.values()].map(group => ({
      relation: group[0]!.relation,
      objectIds: group.map(item => item.targetId),
    })),
    () => writePreparedBookmarkGroups(currentUser, groups, prepared),
  )
}

async function writePreparedBookmarkGroups(
  currentUser: PrivateUser,
  groups: ReadonlyMap<string, AuthorizedBookmarkAction[]>,
  prepared: readonly AuthorizedBookmarkAction[],
) {
  const results = new Map<string, Awaited<ReturnType<typeof bookmarkEntities>>[number]>()
  for (const group of groups.values()) {
    const first = group[0]!
    const guards = group.flatMap(item => (item.guard ? [item.guard] : []))
    const postMutationGuard = guards.length
      ? {
          assertAllowed: async (query: Parameters<(typeof guards)[number]['assertAllowed']>[0]) => {
            // oxlint-disable-next-line no-await-in-loop -- authorization checks share this transaction client
            for (const guard of guards) await guard.assertAllowed(query)
          },
        }
      : undefined
    try {
      const ids = [...new Set(group.map(item => item.targetId.toLowerCase()))]
      // oxlint-disable no-await-in-loop -- relation groups apply their ordered side effects after whole-request admission
      // no-mistakes-disable-next-line query-reached-per-item: one batch mutation per distinct relation table after whole-request admission
      const relations = await bookmarkEntities(
        currentUser,
        first.type,
        ids.map(id => ({ id })),
        first.predicate,
        postMutationGuard ? { postMutationGuard } : undefined,
      )
      // oxlint-enable no-await-in-loop
      for (const relation of relations)
        results.set(`${first.relation.table_name}:${relation.object_id}`, relation)
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23503') assert(false, 404, 'Entity not found')
      throw err
    }
  }
  return prepared.map(item =>
    results.get(`${item.relation.table_name}:${item.targetId.toLowerCase()}`),
  )
}

async function upsertBookmarkActions(
  currentUser: PrivateUser,
  authority: EntityRelationActionAuthority,
  inputs: readonly BookmarkActionInput[],
) {
  const settled = await prepareBookmarkActions(currentUser, authority, inputs)
  const prepared = settled.map(result => {
    if (result.status === 'rejected') throw result.reason
    return result.value
  })
  return upsertPreparedBookmarkActions(currentUser, prepared)
}

export async function upsertBookmarkAction(
  currentUser: PrivateUser,
  authority: EntityRelationActionAuthority,
  input: BookmarkActionInput,
) {
  const [relation] = await upsertBookmarkActions(currentUser, authority, [input])
  return relation
}

/**
 * Removes one bookmark-class relation. It checks no target visibility on purpose: a viewer must be
 * able to clear a bookmark on an entity that has since become hidden, and the removal reads or
 * discloses nothing about it, so a delegated credential needs no private-content grant either.
 */
export async function deleteBookmarkAction(currentUser: PrivateUser, input: BookmarkActionInput) {
  assertNotSuspended(currentUser)
  assert(isUUID(input.entityId), 422, 'Invalid entity ID')
  const targetId =
    input.entityType === 'topic'
      ? ((await getTopicByAnyWithRedirectCached(input.entityId))?.topic.id ?? input.entityId)
      : input.entityId
  await unbookmarkEntity(
    currentUser,
    input.entityType as EntityRelationEntityType,
    { id: targetId },
    input.predicate as EntityRelationPredicateType,
  )
}
