import { getRelationTypeLimit } from './relation-limits-config.mts'
export { relationLimitsConfig, relationLimitsMaxValues } from './relation-limits-config.mts'
import { AsyncLocalStorage } from 'node:async_hooks'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createCodedError } from '@vouchington/sentry'
import { RELATION_LIMIT_REACHED } from '@modules/on-error/error-codes'
import type { EntityRelationMetadata } from './metadata.mts'

type LimitState = { remaining: number; existingObjectIds: string[] }
type LimitGroup = {
  relation: EntityRelationMetadata
  objectIds: readonly string[]
  skipIfDeleted?: boolean
}
const admittedRelations = new AsyncLocalStorage<
  Map<string, { ids: Set<string>; state: LimitState | null }>
>()

/** Admit all tables before writing; accepted races may overshoot, never partially refuse a batch. */
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

/** Thin single-table reader; all independent counts and existing-row reads share one primary statement. */
export async function getRelationLimitState(
  relation: EntityRelationMetadata,
  subjectId: string,
  objectIds: readonly string[],
  options?: { skipIfDeleted?: boolean },
): Promise<LimitState | null> {
  return (
    (await getRelationLimitStates(subjectId, [{ relation, objectIds, ...options }])).get(
      relation.table_name,
    ) ?? null
  )
}

/** Refuse the whole batch, counting only distinct rows that would become newly active. */
export async function assertRelationLimit(
  relation: EntityRelationMetadata,
  subjectId: string,
  objectIds: readonly string[],
  options?: { skipIfDeleted?: boolean },
): Promise<void> {
  if (objectIds.length === 0 || isAdmitted(subjectId, { relation, objectIds })) return
  assertWithinCapacity(
    objectIds,
    await getRelationLimitState(relation, subjectId, objectIds, options),
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
): Promise<Map<string, LimitState>> {
  const limited = groups.flatMap(group => {
    const limit = getRelationTypeLimit(group.relation.table_name)
    return limit === null ? [] : [{ ...group, limit }]
  })
  if (limited.length === 0) return new Map()
  const query = sql`/* getRelationLimitState */ `
  for (const [index, group] of limited.entries()) {
    if (index > 0) query.append(' UNION ALL ')
    const table = group.relation.table_name
    const previous = admittedRelations.getStore()?.get(`${table}:${subjectId.toLowerCase()}`)
    const ids = [
      ...new Set([...group.objectIds.map(id => id.toLowerCase()), ...(previous?.ids ?? [])]),
    ]
    query.append(sql`SELECT ${table}::text AS table_name, ${group.limit}::int AS relation_limit,
      (SELECT count(*)::int FROM (SELECT 1 FROM `)
    // Identifiers are accepted only by the fixed config table allowlist.
    query.append(table)
    query.append(sql` WHERE subject_id = ${subjectId} AND deleted_at IS NULL LIMIT ${group.limit}) capped) AS active_count,
      ARRAY(SELECT existing.object_id FROM `)
    query.append(table)
    query.append(sql` existing WHERE existing.subject_id = ${subjectId}
      AND existing.object_id = ANY(${ids}::uuid[])
      AND (existing.deleted_at IS NULL OR ${group.skipIfDeleted === true})) AS existing_object_ids`)
  }
  const { rows } = await write<{
    table_name: string
    relation_limit: number
    active_count: number
    existing_object_ids: string[]
  }>(query)
  return new Map(
    rows.map(row => {
      const requested = new Set(
        limited
          .find(group => group.relation.table_name === row.table_name)!
          .objectIds.map(id => id.toLowerCase()),
      )
      const active = new Set(row.existing_object_ids)
      const previous = admittedRelations
        .getStore()
        ?.get(`${row.table_name}:${subjectId.toLowerCase()}`)
      const reservedOthers = [...(previous?.ids ?? [])].filter(
        id => !requested.has(id) && !active.has(id),
      ).length
      return [
        row.table_name,
        {
          remaining: Math.max(0, row.relation_limit - row.active_count - reservedOthers),
          existingObjectIds: row.existing_object_ids,
        },
      ]
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
  for (const id of group.objectIds.map(id => id.toLowerCase())) {
    if (previous?.ids.has(id) && !allowed.has(id)) {
      allowed.add(id)
      remaining -= 1
    }
  }
  for (const id of new Set(group.objectIds.map(id => id.toLowerCase()))) {
    if (allowed.has(id)) continue
    if (covered || remaining > 0) {
      allowed.add(id)
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
