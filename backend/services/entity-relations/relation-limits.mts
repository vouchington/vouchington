export { relationLimitsConfig, relationLimitsMaxValues } from './relation-limits-config.mts'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { QueryOptions } from '@data-stores/psql'
import { createCodedError } from '@vouchington/sentry'
import { RELATION_LIMIT_REACHED } from '@modules/on-error/error-codes'
import type { EntityRelationMetadata } from './metadata.mts'

import {
  readRelationLimitStates,
  type LimitState,
  type LimitGroup,
  type SubjectLimitGroup,
  type RelationAdmission,
} from './relation-limit-states.mts'
const admittedRelations = new AsyncLocalStorage<Map<string, RelationAdmission>>()

/**
 * Admit all tables before writing; never partially refuse a batch. Post-related URLs recheck
 * capacity in their write transaction. Concurrent admissions may still overshoot the cap.
 */
export async function withRelationLimitAdmission<T>(
  subjectId: string,
  groups: readonly LimitGroup[],
  run: () => Promise<T>,
): Promise<T> {
  const pending = groups.filter(group => !isAdmitted(subjectId, group))
  const states = await getRelationLimitStates(subjectId, pending)
  for (const group of pending)
    assertWithinCapacity(group.objectIds, states.get(group.relation.table_name))
  return runWithAdmission(subjectId, groups, states, run)
}

export async function getRelationLimitState(
  relation: EntityRelationMetadata,
  subjectId: string,
  objectIds: readonly string[],
  options?: QueryOptions & { skipIfDeleted?: boolean },
): Promise<LimitState | null> {
  const group = { relation, objectIds, skipIfDeleted: options?.skipIfDeleted }
  const states = await getRelationLimitStates(subjectId, [group], options)
  return states.get(relation.table_name) ?? null
}

/** Refuse the whole batch, counting only distinct rows that would become newly active. */
export async function assertRelationLimit(
  relation: EntityRelationMetadata,
  subjectId: string,
  objectIds: readonly string[],
  options?: QueryOptions & { skipIfDeleted?: boolean },
): Promise<void> {
  await assertRelationLimits(
    [{ relation, subjectId, objectIds, skipIfDeleted: options?.skipIfDeleted }],
    options,
  )
}

/** One primary statement admits all subject/table groups before any batch row is written. */
export async function assertRelationLimits(
  groups: readonly SubjectLimitGroup[],
  options?: QueryOptions,
): Promise<void> {
  const pending = groups.filter(
    group =>
      group.objectIds.length > 0 &&
      (group.relation.table_name === 'relation__post__related__url' ||
        !isAdmitted(group.subjectId, group)),
  )
  const states = await readRelationLimitStates(pending, admittedRelations.getStore(), options)
  for (const group of pending)
    assertWithinCapacity(
      group.objectIds,
      states.get(`${group.relation.table_name}:${group.subjectId.toLowerCase()}`),
    )
}

export function isRelationLimitError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && 'code' in err && err.code === RELATION_LIMIT_REACHED
  )
}

async function getRelationLimitStates(
  subjectId: string,
  groups: readonly LimitGroup[],
  options?: QueryOptions,
): Promise<Map<string, LimitState>> {
  const states = await readRelationLimitStates(
    groups.map(group => ({ ...group, subjectId })),
    admittedRelations.getStore(),
    options,
  )
  return new Map(
    groups.flatMap(group => {
      const state = states.get(`${group.relation.table_name}:${subjectId.toLowerCase()}`)
      return state ? [[group.relation.table_name, state]] : []
    }),
  )
}

function isAdmitted(subjectId: string, group: LimitGroup): boolean {
  const admitted = admittedRelations
    .getStore()
    ?.get(`${group.relation.table_name}:${subjectId.toLowerCase()}`)
  return !!admitted && group.objectIds.every(id => admitted.ids.has(id.toLowerCase()))
}

function assertWithinCapacity(
  objectIds: readonly string[],
  state: LimitState | null | undefined,
): void {
  if (!state) return
  const existing = new Set(state.existingObjectIds)
  const newCount = [...new Set(objectIds.map(id => id.toLowerCase()))].filter(
    id => !existing.has(id),
  ).length
  if (newCount > state.remaining)
    throw createCodedError(409, 'Relation limit reached', RELATION_LIMIT_REACHED)
}

/** Read capacity once, admit the fitting prefix, and preserve that decision through its writes. */
export async function withAvailableRelationCapacity<T>(
  subjectId: string,
  group: LimitGroup,
  run: (state: LimitState | null, allowedIds: ReadonlySet<string>) => Promise<T>,
): Promise<T> {
  const key = `${group.relation.table_name}:${subjectId.toLowerCase()}`
  const covered = isAdmitted(subjectId, group)
  const state = covered
    ? admittedRelations.getStore()!.get(key)!.state
    : await getRelationLimitState(group.relation, subjectId, group.objectIds)
  const allowed = new Set(state?.existingObjectIds ?? [])
  let remaining = state?.remaining ?? group.objectIds.length
  const previous = admittedRelations.getStore()?.get(key)
  for (const objectId of group.objectIds.map(id => id.toLowerCase())) {
    if (previous?.ids.has(objectId) && !allowed.has(objectId)) {
      allowed.add(objectId)
      remaining -= 1
    }
  }
  for (const objectId of new Set(group.objectIds.map(id => id.toLowerCase()))) {
    if (allowed.has(objectId)) continue
    if (covered || remaining > 0) {
      allowed.add(objectId)
      remaining -= 1
    }
  }
  return runWithAdmission(
    subjectId,
    [{ ...group, objectIds: [...allowed] }],
    new Map([[group.relation.table_name, state]]),
    () => run(state, allowed),
  )
}

function runWithAdmission<T>(
  subjectId: string,
  groups: readonly LimitGroup[],
  states: ReadonlyMap<string, LimitState | null>,
  run: () => Promise<T>,
): Promise<T> {
  const admitted = new Map(admittedRelations.getStore())
  for (const group of groups) {
    const key = `${group.relation.table_name}:${subjectId.toLowerCase()}`
    const previous = admitted.get(key)
    const ids = new Set(previous?.ids)
    for (const id of group.objectIds) ids.add(id.toLowerCase())
    admitted.set(key, {
      ids,
      state: previous?.state ?? states.get(group.relation.table_name) ?? null,
    })
  }
  return admittedRelations.run(admitted, run)
}
