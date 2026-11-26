import type {
  BookmarkTarget,
  SetBookmarkArgs,
  BookmarkTargetResult,
} from './bookmark-batch-types.mts'
import { createCodedError } from '@vouchington/sentry'
import { CONTRIBUTION_ADMISSION_IN_PROGRESS } from '@modules/on-error/error-codes'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import { isUUID } from '@modules/utils'
import { bookmarksWorkMaxValues, getBookmarksWorkLimit } from '@services/bookmarks/work-limits'
import { assertCanContribute } from '@services/contribution-gating/assert'
import {
  upsertPreparedBookmarkActions,
  type EntityRelationActionAuthority,
} from '@services/entity-relation-actions'
import type { PrivateUser } from '@services/users/types'
import {
  importTopics,
  claimTopicImportAttempt,
  TopicImportInProgressError,
  type ImportTopicResult,
} from '@services/user-import-export/import-topics'
import assert from 'http-assert'
import { withRelationLimitAdmission } from '@services/entity-relations/relation-limits'
import { prepareBookmarkTargets } from './set-bookmark-prepare.mts'

// The structured MCP result cap is 512 KiB. Echoed targets stay under half of that.
const MAX_ECHOED_TARGET_BYTES = 256 * 1024

function importResult(target: BookmarkTarget, result: ImportTopicResult): BookmarkTargetResult {
  return {
    entity_type: target.entity_type,
    entity: target.entity,
    status: result.status,
    ...(result.error_code ? { error_code: result.error_code } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(result.entity_id ? { entity_id: result.entity_id } : {}),
    ...(result.recommendation_post_id
      ? { recommendation_post_id: result.recommendation_post_id }
      : {}),
  }
}

/** Resolve and preflight the entire request before any bookmark or recommendation writes. */
export async function setBookmarkTargets(
  currentUser: PrivateUser,
  authority: EntityRelationActionAuthority,
  args: SetBookmarkArgs,
): Promise<BookmarkTargetResult[]> {
  const hardMax = bookmarksWorkMaxValues.set_bookmark_max_targets
  assert(args.targets.length <= hardMax, 400, `At most ${hardMax} targets`)
  const limit = getBookmarksWorkLimit('set_bookmark_max_targets')
  const admissionRejection = args.targets.length > limit ? `At most ${limit} targets` : undefined
  assert(
    Buffer.byteLength(JSON.stringify(args.targets), 'utf8') <= MAX_ECHOED_TARGET_BYTES,
    400,
    'Targets are too large to return',
  )
  const recommend = args.recommend_unknown_topics === true && args.predicate === 'follow'
  if (admissionRejection !== undefined) assert(recommend, 400, admissionRejection)
  if (args.recommend_unknown_topics === true) {
    assert(
      authority.kind === 'delegated' && authority.grantedScopes.includes('posts:write'),
      403,
      'Tool requires scopes posts:write',
    )
    assert(args.idempotency_key, 400, 'Idempotency-Key must be a UUID')
  }
  const { allIds, accepted, results, groups } = await prepareBookmarkTargets(
    currentUser,
    authority,
    args,
  )
  const topicIndexes = recommend
    ? args.targets.flatMap((target, index) =>
        target.entity_type === 'topic' &&
        !isUUID(target.entity.trim()) &&
        (!allIds[index] || accepted.some(item => item.index === index))
          ? [index]
          : [],
      )
    : []
  if (admissionRejection !== undefined)
    assert(topicIndexes.length === args.targets.length, 400, admissionRejection)
  // Check the existing topic import before refusing a new over-limit batch.
  const names = topicIndexes.map(index => args.targets[index]!.entity)
  const replay =
    names.length > 0
      ? (
          await claimTopicImportAttempt(
            currentUser.id,
            args.idempotency_key!,
            names,
            admissionRejection,
          )
        ).response
      : undefined
  const imported = new Map<number, BookmarkTargetResult>()
  if (replay)
    topicIndexes.forEach((index, position) =>
      imported.set(index, importResult(args.targets[index]!, replay[position]!)),
    )
  const admittedGroups = replay
    ? groups.flatMap(group => {
        const objectIds = accepted.flatMap(item =>
          !imported.has(item.index) && item.value.relation.table_name === group.relation.table_name
            ? [item.value.targetId]
            : [],
        )
        return objectIds.length > 0 ? [{ ...group, objectIds }] : []
      })
    : groups
  return withRelationLimitAdmission(currentUser.id, admittedGroups, async () => {
    if (topicIndexes.length > 0 && !replay) {
      let topicImportResults: ImportTopicResult[]
      try {
        topicImportResults = await importTopics(currentUser, getRequestContentProvenance(), names, {
          assertCanCreateTopicRecommendations: () =>
            assertCanContribute(currentUser, {
              membershipPlan: currentUser.membership_plan ?? null,
            }),
          importAttemptId: args.idempotency_key!,
          newAdmissionRejection: admissionRejection,
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
        imported.set(index, importResult(args.targets[index]!, topicImportResults[position]!))
      })
    }

    for (const [index, item] of imported) results[index] = item
    const direct = accepted.filter(item => !imported.has(item.index))
    const relations = await upsertPreparedBookmarkActions(
      currentUser,
      direct.map(item => item.value),
    )
    for (const [position, { index }] of direct.entries()) {
      const relation = relations[position]!
      const target = args.targets[index]!
      const { id, subject_id, object_id, created_at, created_by_id } = relation
      results[index] = {
        entity_type: target.entity_type,
        entity: target.entity,
        status: 'set',
        bookmark: { id, subject_id, object_id, created_at, created_by_id },
      }
    }
    return results
  })
}
