import assert from 'http-assert'
import type { ApiScope } from '@modules/scopes'
import {
  getEntityRelations,
  parseEntityRelationCreateInput,
  upsertEntityRelation,
} from '@services/entity-relations'
import {
  assertPostMutationAccess,
  assertRelatablePostAccess,
} from '@services/entity-relations/post-access'
import { refreshEntityRelationVoteStatsFromPrimaryWithFallback } from '@services/elections-votes/entity-relation/refresh-stats'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import { assertWithinContributionQuota } from '@services/contribution-gating/quota'
import { getContributionStatus } from '@services/contribution-gating/assert'
import { getUserActivePlan } from '@services/memberships'
import { assertWithinTagAddLimit } from '@services/tag-limits'
import { assertNotSuspended, entityRelationViewerFor, isAdminUser } from '@services/users'
import { assertUserTagAllowed } from './user-tag-authorization.mts'
import {
  currentUserCanModerateCommunity,
  getCommunity,
  getCommunityMember,
} from '@services/communities'
import type { PrivateUser } from '@services/users/types'

export type EntityRelationActionAuthority =
  | { readonly kind: 'first_party' }
  | {
      readonly kind: 'delegated'
      readonly credentialOwnerId: string
      readonly grantedScopes: readonly ApiScope[]
    }

export type CreateEntityRelationActionInput = {
  readonly entityType: string
  readonly entityId: string
  readonly predicate: string
  readonly objectType: string
  readonly objectId?: string
}

/** Admission that must precede HTTP body parsing to preserve route error precedence. */
export function assertCreateEntityRelationActionAdmission(
  currentUser: PrivateUser,
  entityType: string,
  objectType: string,
): void {
  assertNotSuspended(currentUser)
  assert(entityType !== 'topic_alias' && objectType !== 'topic_alias', 404, 'Not found')
}

/** Complete domain command shared by session REST and credential-delegated callers. */
export async function createEntityRelationAction(
  currentUser: PrivateUser,
  authority: EntityRelationActionAuthority,
  input: CreateEntityRelationActionInput,
) {
  assertCreateEntityRelationActionAdmission(currentUser, input.entityType, input.objectType)
  const parsed = parseEntityRelationCreateInput(input)
  assert(
    parsed.metadata.subject_type !== 'remote_actor',
    403,
    'remote_actor relations cannot be created via this endpoint',
  )

  const viewer = entityRelationViewerFor(currentUser)
  const postIds = postParticipantIds(parsed.metadata, parsed.subjectId.id, parsed.objectIds)
  // Ordinary visibility/existence comes first so private authorization never discloses a hidden post.
  await assertRelatablePostAccess(viewer, postIds)

  const resolvedUserTagTargetId = await resolveUserTagTarget(currentUser, parsed)
  await assertCommunityAuthorization(currentUser, parsed)
  await assertRelationLimit(currentUser, parsed)
  const postRootIds = await assertPostMutationAccess(viewer, authority, postIds)

  const relations = await upsertEntityRelation(
    currentUser,
    parsed.metadata,
    resolvedUserTagTargetId ? { id: resolvedUserTagTargetId } : parsed.subjectId,
    parsed.objectIds,
    {
      ...(resolvedUserTagTargetId ? { enqueueVoteStats: false } : {}),
      ...(postIds.subjectIds.length > 0 || postIds.objectIds.length > 0
        ? {
            postMutationGuard: {
              postIds: [...postIds.subjectIds, ...postIds.objectIds, ...postRootIds.values()],
              assertAllowed: query =>
                assertPostMutationAccess(viewer, authority, postIds, { query }, postRootIds).then(
                  () => undefined,
                ),
            },
          }
        : {}),
    },
  )
  assert(relations.length > 0, 500, 'Failed to create entity relation')

  if (parsed.metadata.subject_type === 'user') {
    await Promise.all(
      relations.flatMap(relation =>
        relation.id
          ? [
              refreshEntityRelationVoteStatsFromPrimaryWithFallback(
                createEntityRelationElectionTarget(relation.id, parsed.metadata.table_name),
              ),
            ]
          : [],
      ),
    )
  }

  const [relation] = await getEntityRelations(
    parsed.metadata.subject_type,
    relations[0]!.subject_id,
    parsed.metadata.predicate,
    parsed.metadata.object_type,
    { viewer, readOnly: false, objectIds: [relations[0]!.object_id] },
  )
  if (!relation) throw new Error('A created entity relation is hidden from its creator')
  return { relation, viewer, metadata: parsed.metadata }
}

function postParticipantIds(
  metadata: { subject_type: string; object_type: string },
  subjectId: string,
  objectIds: readonly { id: string }[],
) {
  return {
    subjectIds: metadata.subject_type === 'post' ? [subjectId] : [],
    objectIds: metadata.object_type === 'post' ? objectIds.map(object => object.id) : [],
  }
}

async function resolveUserTagTarget(
  currentUser: PrivateUser,
  parsed: ReturnType<typeof parseEntityRelationCreateInput>,
): Promise<string | undefined> {
  if (parsed.metadata.subject_type !== 'user') return undefined
  const targetId = await assertUserTagAllowed(
    currentUser,
    parsed.subjectId.id,
    parsed.objectIds[0]!.id,
  )
  if (!isAdminUser(currentUser)) {
    const membershipPlan = await getUserActivePlan(currentUser.id)
    const contributionStatus = await getContributionStatus(currentUser, {
      membershipPlan,
      skipAccountAgeGate: true,
    })
    assert(
      contributionStatus.allowed,
      403,
      'A verified non-disposable email address is required to vote.',
    )
    await assertWithinContributionQuota(currentUser.id, false, membershipPlan)
  }
  return targetId
}

async function assertCommunityAuthorization(
  currentUser: PrivateUser,
  parsed: ReturnType<typeof parseEntityRelationCreateInput>,
): Promise<void> {
  if (parsed.metadata.subject_type !== 'community') return
  const community = await getCommunity(parsed.subjectId.id)
  assert(community, 404, 'Community not found')
  const membership = await getCommunityMember(community.id, currentUser.id)
  assert(
    currentUserCanModerateCommunity(currentUser, community, membership ?? undefined),
    403,
    'Forbidden',
  )
}

async function assertRelationLimit(
  currentUser: PrivateUser,
  parsed: ReturnType<typeof parseEntityRelationCreateInput>,
): Promise<void> {
  if (
    !parsed.metadata.election ||
    parsed.metadata.is_bookmark ||
    !['post', 'topic', 'rss_feed_item'].includes(parsed.metadata.subject_type)
  ) {
    return
  }
  const membershipPlan = isAdminUser(currentUser) ? null : await getUserActivePlan(currentUser.id)
  await assertWithinTagAddLimit(
    currentUser,
    membershipPlan,
    parsed.metadata,
    parsed.subjectId.id,
    parsed.objectIds.length,
  )
}
