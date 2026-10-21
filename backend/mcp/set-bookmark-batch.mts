import { createCodedError } from '@modules/on-error/create-coded-error'
import { CONTRIBUTION_ADMISSION_IN_PROGRESS } from '@modules/on-error/error-codes'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import { isUUID } from '@modules/utils'
import { assertCanContribute } from '@services/contribution-gating/assert'
import {
  upsertBookmarkAction,
  type EntityRelationActionAuthority,
} from '@services/entity-relation-actions'
import type { PrivateUser } from '@services/users/types'
import {
  importTopics,
  TopicImportInProgressError,
  type ImportTopicResult,
} from '@services/user-import-export/import-topics'
import assert from 'http-assert'
import { canonicalEntityIds } from './resolve-entity-reference.mts'

export const SET_BOOKMARK_LIMIT = 500

// The structured MCP result cap is 512 KiB. Echoed targets stay under half of that.
const MAX_ECHOED_TARGET_BYTES = 256 * 1024

export type BookmarkTarget = { entity_type: string; entity: string }

export type SetBookmarkArgs = {
  predicate: string
  targets: BookmarkTarget[]
  recommend_unknown_topics?: boolean
  idempotency_key?: string
}

type BookmarkRow = {
  id?: string
  subject_id: string
  object_id: string
  created_at: Date
  created_by_id: string
}

export type BookmarkTargetResult = {
  entity_type: string
  entity: string
  status: 'set' | 'error' | ImportTopicResult['status']
  bookmark?: BookmarkRow
  error?: string
  entity_id?: string
  recommendation_post_id?: string
}

function isAccountSuspended(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'ACCOUNT_SUSPENDED'
  )
}

function clientErrorMessage(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('status' in err)) return undefined
  const status = (err as { status: unknown }).status
  if (typeof status !== 'number' || status < 400 || status >= 500) return undefined
  return err instanceof Error ? err.message : 'Unknown error'
}

async function resolvedIds(targets: readonly BookmarkTarget[]): Promise<Array<string | null>> {
  const groups = new Map<string, number[]>()
  targets.forEach((target, index) => {
    const indexes = groups.get(target.entity_type) ?? []
    indexes.push(index)
    groups.set(target.entity_type, indexes)
  })
  const ids: Array<string | null> = targets.map(() => null)
  await Promise.all(
    [...groups].map(async ([entityType, indexes]) => {
      // no-mistakes-disable-next-line query-reached-per-item: one lookup statement per entity type
      const resolved = await canonicalEntityIds(
        entityType,
        indexes.map(index => targets[index]!.entity),
      )
      indexes.forEach((index, position) => {
        ids[index] = resolved[position] ?? null
      })
    }),
  )
  return ids
}

function importResult(target: BookmarkTarget, result: ImportTopicResult): BookmarkTargetResult {
  return {
    entity_type: target.entity_type,
    entity: target.entity,
    status: result.status,
    ...(result.error ? { error: result.error } : {}),
    ...(result.entity_id ? { entity_id: result.entity_id } : {}),
    ...(result.recommendation_post_id
      ? { recommendation_post_id: result.recommendation_post_id }
      : {}),
  }
}

/** One bookmark write per target, after one id lookup per entity type. */
export async function setBookmarkTargets(
  currentUser: PrivateUser,
  authority: EntityRelationActionAuthority,
  args: SetBookmarkArgs,
): Promise<BookmarkTargetResult[]> {
  assert(args.targets.length <= SET_BOOKMARK_LIMIT, 400, 'At most 500 targets')
  assert(
    Buffer.byteLength(JSON.stringify(args.targets), 'utf8') <= MAX_ECHOED_TARGET_BYTES,
    400,
    'Targets are too large to return',
  )
  const recommend = args.recommend_unknown_topics === true && args.predicate === 'follow'
  if (args.recommend_unknown_topics === true) {
    assert(
      authority.kind === 'delegated' &&
        authority.grantedScopes.includes('topic-recommendations:write'),
      403,
      'Tool requires scopes topic-recommendations:write',
    )
    assert(args.idempotency_key, 400, 'Idempotency-Key must be a UUID')
  }
  const topicIndexes = recommend
    ? args.targets.flatMap((target, index) =>
        target.entity_type === 'topic' && !isUUID(target.entity.trim()) ? [index] : [],
      )
    : []
  const imported = new Map<number, BookmarkTargetResult>()
  if (topicIndexes.length > 0) {
    const names = topicIndexes.map(index => args.targets[index]!.entity)
    let results: ImportTopicResult[]
    try {
      results = await importTopics(currentUser, getRequestContentProvenance(), names, {
        assertCanCreateTopicRecommendations: () =>
          assertCanContribute(currentUser, { membershipPlan: currentUser.membership_plan ?? null }),
        importAttemptId: args.idempotency_key!,
        callerCanReplayIdempotencyIdentity: true,
        membershipPlan: currentUser.membership_plan ?? null,
      })
    } catch (err) {
      if (!(err instanceof TopicImportInProgressError)) throw err
      throw Object.assign(
        createCodedError(
          409,
          'This topic import is still being processed. Please retry.',
          CONTRIBUTION_ADMISSION_IN_PROGRESS,
        ),
        { retryAfterSeconds: err.retryAfterSeconds },
      )
    }
    topicIndexes.forEach((index, position) => {
      imported.set(index, importResult(args.targets[index]!, results[position]!))
    })
  }

  const bookmarkIndexes = args.targets.flatMap((_, index) => (imported.has(index) ? [] : [index]))
  const ids = await resolvedIds(bookmarkIndexes.map(index => args.targets[index]!))
  const results: BookmarkTargetResult[] = args.targets.map(target => ({
    entity_type: target.entity_type,
    entity: target.entity,
    status: 'error',
    error: 'Entity not found',
  }))
  for (const [index, item] of imported) results[index] = item
  // oxlint-disable no-await-in-loop -- each target runs bookmarkEntity's side effects
  for (const [position, index] of bookmarkIndexes.entries()) {
    const id = ids[position]
    if (!id) continue
    const target = args.targets[index]!
    try {
      // no-mistakes-disable-next-line query-reached-per-item: each target applies the vouch rate limit and relation metrics
      const relation = await upsertBookmarkAction(currentUser, authority, {
        entityType: target.entity_type,
        entityId: id,
        predicate: args.predicate,
      })
      const { id: relationId, subject_id, object_id, created_at, created_by_id } = relation!
      results[index] = {
        entity_type: target.entity_type,
        entity: target.entity,
        status: 'set',
        bookmark: { id: relationId, subject_id, object_id, created_at, created_by_id },
      }
    } catch (err) {
      if (isAccountSuspended(err)) throw err
      const message = clientErrorMessage(err)
      if (message === undefined) throw err
      results[index] = {
        entity_type: target.entity_type,
        entity: target.entity,
        status: 'error',
        error: message,
      }
    }
  }
  // oxlint-enable no-await-in-loop
  return results
}
