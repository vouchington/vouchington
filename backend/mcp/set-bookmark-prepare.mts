import {
  prepareBookmarkActions,
  type EntityRelationActionAuthority,
} from '@services/entity-relation-actions'
import type { PrivateUser } from '@services/users/types'
import { canonicalEntityIds } from './resolve-entity-reference.mts'
import type { SetBookmarkArgs, BookmarkTargetResult } from './bookmark-batch-types.mts'

/** Resolve once per entity type, then authorize before counting any target against capacity. */
export async function prepareBookmarkTargets(
  currentUser: PrivateUser,
  authority: EntityRelationActionAuthority,
  args: SetBookmarkArgs,
) {
  const indexesByType = new Map<string, number[]>()
  args.targets.forEach((target, index) => {
    const indexes = indexesByType.get(target.entity_type) ?? []
    indexes.push(index)
    indexesByType.set(target.entity_type, indexes)
  })
  const allIds: Array<string | null> = args.targets.map(() => null)
  await Promise.all(
    [...indexesByType].map(async ([entityType, indexes]) => {
      // no-mistakes-disable-next-line query-reached-per-item: each entity type uses its own batch reference resolver
      const ids = await canonicalEntityIds(
        entityType,
        indexes.map(index => args.targets[index]!.entity),
      )
      indexes.forEach((index, position) => {
        allIds[index] = ids[position] ?? null
      })
    }),
  )
  const resolvedIndexes = allIds.flatMap((id, index) => (id ? [index] : []))
  const prepared = await prepareBookmarkActions(
    currentUser,
    authority,
    resolvedIndexes.map(index => ({
      entityType: args.targets[index]!.entity_type,
      entityId: allIds[index]!,
      predicate: args.predicate,
    })),
  )
  const results: BookmarkTargetResult[] = args.targets.map(target => ({
    ...target,
    status: 'error',
    error: 'Entity not found',
  }))
  const accepted = prepared.flatMap((item, position) => {
    const index = resolvedIndexes[position]!
    if (item.status === 'fulfilled') return [{ index, value: item.value }]
    const error: unknown = item.reason
    if (
      typeof error !== 'object' ||
      error === null ||
      !('status' in error) ||
      typeof error.status !== 'number' ||
      error.status < 400 ||
      error.status >= 500 ||
      ('code' in error && error.code === 'ACCOUNT_SUSPENDED')
    )
      throw error
    results[index] = {
      ...results[index]!,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
    return []
  })
  const byTable = new Map<
    string,
    { relation: (typeof accepted)[number]['value']['relation']; objectIds: string[] }
  >()
  for (const { value } of accepted) {
    const group = byTable.get(value.relation.table_name) ?? {
      relation: value.relation,
      objectIds: [],
    }
    group.objectIds.push(value.targetId)
    byTable.set(value.relation.table_name, group)
  }
  return { allIds, accepted, results, groups: [...byTable.values()] }
}
