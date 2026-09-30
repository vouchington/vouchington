/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { beforeAll, describe, expect, test } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import type { Response } from 'supertest'
import type { Community } from '../services/communities/types.mts'
import type { PrivateUser } from '../services/users/types.mts'

type ModInternalThreadActors = {
  community: Community
  member: PrivateUser
  moderator: PrivateUser
  subjectUser: PrivateUser
}

type ModInternalThreadRouteOptions = {
  conversationSubjectField: 'post_id' | 'moderation_report_id'
  createSubject: (input: { community: Community; subjectUser: PrivateUser }) => Promise<string>
  resource: 'posts' | 'reports'
  subjectUserIsMember: boolean
}

type ModInternalThreadResource = ModInternalThreadRouteOptions['resource']

/** Shared community mod-internal-thread route cases. Call from a literal `describe`. */
export function registerCommunityModInternalThreadRouteTests(
  options: ModInternalThreadRouteOptions,
): void {
  let moderator: PrivateUser
  let member: PrivateUser
  let subjectUser: PrivateUser
  let community: Community

  beforeAll(async () => {
    ;[moderator, member, subjectUser] = (await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])) as PrivateUser[]
    community = await insertTestCommunity({ createdById: moderator.id })
    const memberships = [
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: member.id,
        role: 'member',
      }),
    ]
    if (options.subjectUserIsMember) {
      memberships.push(
        insertTestCommunityMember({
          communityId: community.id,
          userId: subjectUser.id,
          role: 'member',
        }),
      )
    }
    await Promise.all(memberships)
  })

  const actors = (): ModInternalThreadActors => ({
    community,
    member,
    moderator,
    subjectUser,
  })
  const subjectParam = options.resource === 'posts' ? 'postId' : 'reportId'

  describe(`POST /api/v1/communities/:idOrSlug/${options.resource}/:${subjectParam}/mod-internal-thread`, () => {
    test('returns 401 when not authenticated', async () => {
      const current = actors()
      const subjectId = await options.createSubject(current)
      const response = await postModInternalThread(
        current.community.slug,
        options.resource,
        subjectId,
        undefined,
        401,
      )
      expect(response.status).toBe(401)
    })

    test('returns 403 for a non-moderator member', async () => {
      const current = actors()
      const subjectId = await options.createSubject(current)
      const response = await postModInternalThread(
        current.community.slug,
        options.resource,
        subjectId,
        current.member,
        403,
      )
      expect(response.status).toBe(403)
    })

    test('allows a community moderator to open a mod internal thread and returns the conversation', async () => {
      const current = actors()
      const subjectId = await options.createSubject(current)
      const response = await postModInternalThread(
        current.community.slug,
        options.resource,
        subjectId,
        current.moderator,
        200,
      )
      expect(response.status).toBe(200)
      expect(response.body.conversation).toMatchObject({
        channel_type: 'mod_internal',
        community_id: current.community.id,
        [options.conversationSubjectField]: subjectId,
      })
    })

    test('is idempotent — returns the same conversation on repeated calls', async () => {
      const current = actors()
      const subjectId = await options.createSubject(current)
      const request = createRequest()
      await request.authenticateAs(current.moderator)
      const url = modInternalThreadUrl(current.community.slug, options.resource, subjectId)
      const first = await request.post(url).expect(200)
      const second = await request.post(url).expect(200)
      expect(second.body.conversation.id).toBe(first.body.conversation.id)
    })

    test('allows a site staff user to open a mod internal thread', async () => {
      const current = actors()
      const staff = await createTestUser({ extraRoles: ['moderator'] })
      const subjectId = await options.createSubject(current)
      const response = await postModInternalThread(
        current.community.slug,
        options.resource,
        subjectId,
        staff,
        200,
      )
      expect(response.body.conversation).toHaveProperty('id')
    })
  })
}

function modInternalThreadUrl(
  communitySlug: string,
  resource: ModInternalThreadResource,
  subjectId: string,
): string {
  return `/api/v1/communities/${communitySlug}/${resource}/${subjectId}/mod-internal-thread`
}

async function postModInternalThread(
  communitySlug: string,
  resource: ModInternalThreadResource,
  subjectId: string,
  user: PrivateUser | undefined,
  status: number,
): Promise<Response> {
  const request = createRequest()
  if (user) await request.authenticateAs(user)
  return request.post(modInternalThreadUrl(communitySlug, resource, subjectId)).expect(status)
}
