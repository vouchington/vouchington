/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { expect, test } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'

type CommunityListGetAuthCase =
  | {
      resource: 'applications'
      unauthenticatedSlugPrefix: 'apps-get-401-'
      forbiddenSlugPrefix: 'apps-get-403-'
      okSlugPrefix: 'apps-get-ok-'
      okVisibility: 'private'
    }
  | {
      resource: 'invites'
      unauthenticatedSlugPrefix: 'invites-get-401-'
      forbiddenSlugPrefix: 'invites-get-403-'
      okSlugPrefix: 'invites-get-ok-'
    }

/** Shared moderator-list GET auth cases. Call from a literal `describe`. */
export function registerCommunityListGetAuthTests(options: CommunityListGetAuthCase): void {
  const listPath = (slug: string): string => `/api/v1/communities/${slug}/${options.resource}`

  test('returns 401 without auth', async () => {
    const user = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: user.id,
      slug: `${options.unauthenticatedSlugPrefix}${random}`,
    })

    const request = createRequest()
    await request.get(listPath(community.slug)).expect(401)
  })

  test('returns 403 as non-mod', async () => {
    const [owner, regular] = await Promise.all([createTestUser(), createTestUser()])
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `${options.forbiddenSlugPrefix}${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: regular.id,
      role: 'member',
    })

    const request = createRequest()
    await request.authenticateAs(regular)

    await request.get(listPath(community.slug)).expect(403)
  })

  test('returns 200 with results as mod', async () => {
    const user = await createTestUser()
    const random = createRandomString(8)
    const community = await insertOkCommunity(options, user.id, random)

    await insertTestCommunityMember({
      communityId: community.id,
      userId: user.id,
      role: 'owner',
    })

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get(listPath(community.slug)).expect(200)

    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body).toHaveProperty('page_info')
  })
}

function insertOkCommunity(
  options: CommunityListGetAuthCase,
  createdById: string,
  random: string,
): ReturnType<typeof insertTestCommunity> {
  const slug = `${options.okSlugPrefix}${random}`
  if (options.resource === 'applications') {
    return insertTestCommunity({
      createdById,
      slug,
      visibility: options.okVisibility,
    })
  }
  return insertTestCommunity({ createdById, slug })
}
