import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestCommunityMember,
} from '@voucha/test-helpers'

type CommunityListItemRouteContext = {
  owner: Awaited<ReturnType<typeof createTestUser>>
  member: Awaited<ReturnType<typeof createTestUser>>
  community: Awaited<ReturnType<typeof insertTestCommunity>>
}

type CommunityListItemRouteCase = {
  createEntityId: (random: string, ownerId: string) => Promise<string>
  registerAdditional?: (context: () => CommunityListItemRouteContext) => void
} & (
  | { segment: 'domains'; itemType: 'url_hostname'; bodyKey: 'url_hostname_id' }
  | { segment: 'urls'; itemType: 'url'; bodyKey: 'url_id' }
  | { segment: 'posts'; itemType: 'post'; bodyKey: 'post_id' }
  | { segment: 'topics'; itemType: 'topic'; bodyKey: 'topic_id' }
)

function registerDomainRoutes(registerCases: () => void): void {
  describe('list-items-domains', () => {
    registerCases()
  })
}

function registerUrlRoutes(registerCases: () => void): void {
  describe('list-items-urls', () => {
    registerCases()
  })
}

function registerPostRoutes(registerCases: () => void): void {
  describe('list-items-posts', () => {
    registerCases()
  })
}

function registerTopicRoutes(registerCases: () => void): void {
  describe('list-items-topics', () => {
    registerCases()
  })
}

function suiteRegistrar(
  segment: CommunityListItemRouteCase['segment'],
): (registerCases: () => void) => void {
  switch (segment) {
    case 'domains':
      return registerDomainRoutes
    case 'urls':
      return registerUrlRoutes
    case 'posts':
      return registerPostRoutes
    case 'topics':
      return registerTopicRoutes
  }
}

/** Shared community list-item mutation cases. Extra reads register through `registerAdditional`. */
export function describeCommunityListItemRoutes(options: CommunityListItemRouteCase): void {
  const { segment, itemType, bodyKey, createEntityId, registerAdditional } = options
  suiteRegistrar(segment)(() => {
    let owner: CommunityListItemRouteContext['owner']
    let member: CommunityListItemRouteContext['member']
    let community: CommunityListItemRouteContext['community']

    beforeAll(async () => {
      const [ownerUser, memberUser] = await Promise.all([createTestUser(), createTestUser()])
      owner = ownerUser!
      member = memberUser!
      community = await insertTestCommunity({ createdById: owner.id })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: community.id, userId: member.id, role: 'member' }),
      ])
    })

    const context = (): CommunityListItemRouteContext => ({ owner, member, community })
    registerAdditional?.(context)

    describe(`POST /api/v1/communities/:slug/list-items/${segment}`, () => {
      it('returns 401 without auth', async () => {
        const entityId = await createEntityId(createRandomString(8), owner.id)
        const request = createRequest()
        await request
          .post(`/api/v1/communities/${community.slug}/list-items/${segment}`)
          .set('Content-Type', 'application/json')
          .send({ [bodyKey]: entityId })
          .expect(401)
      })

      it('returns 403 as non-moderator member', async () => {
        const entityId = await createEntityId(createRandomString(8), owner.id)
        const request = createRequest()
        await request.authenticateAs(member)
        await request
          .post(`/api/v1/communities/${community.slug}/list-items/${segment}`)
          .set('Content-Type', 'application/json')
          .send({ [bodyKey]: entityId })
          .expect(403)
      })

      it('returns 201 and creates item as owner', async () => {
        const entityId = await createEntityId(createRandomString(8), owner.id)
        const request = createRequest()
        await request.authenticateAs(owner)
        const response = await request
          .post(`/api/v1/communities/${community.slug}/list-items/${segment}`)
          .set('Content-Type', 'application/json')
          .send({ [bodyKey]: entityId })
          .expect(201)

        expect(response.body.community_list_item).toBeDefined()
        expect(response.body.community_list_item.entity_id).toBe(entityId)
        expect(response.body.community_list_item.item_type).toBe(itemType)
      })

      it('returns 201 as moderator', async () => {
        const moderator = await createTestUser()
        await insertTestCommunityMember({
          communityId: community.id,
          userId: moderator.id,
          role: 'moderator',
        })
        const entityId = await createEntityId(createRandomString(8), owner.id)
        const request = createRequest()
        await request.authenticateAs(moderator)
        const response = await request
          .post(`/api/v1/communities/${community.slug}/list-items/${segment}`)
          .set('Content-Type', 'application/json')
          .send({ [bodyKey]: entityId })
          .expect(201)

        expect(response.body.community_list_item.entity_id).toBe(entityId)
      })

      it('returns 422 when the entity id is missing', async () => {
        const request = createRequest()
        await request.authenticateAs(owner)
        await request
          .post(`/api/v1/communities/${community.slug}/list-items/${segment}`)
          .set('Content-Type', 'application/json')
          .send({})
          .expect(422)
      })
    })

    describe(`DELETE /api/v1/communities/:slug/list-items/${segment}/:itemId`, () => {
      async function insertItem(random: string) {
        return insertTestCommunityListItem({
          communityId: community.id,
          itemType,
          entityId: await createEntityId(random, owner.id),
        })
      }

      it('returns 401 without auth', async () => {
        const item = await insertItem(createRandomString(8))
        const request = createRequest()
        await request
          .delete(`/api/v1/communities/${community.slug}/list-items/${segment}/${item.id}`)
          .expect(401)
      })

      it('returns 403 as non-moderator member', async () => {
        const item = await insertItem(createRandomString(8))
        const request = createRequest()
        await request.authenticateAs(member)
        await request
          .delete(`/api/v1/communities/${community.slug}/list-items/${segment}/${item.id}`)
          .expect(403)
      })

      it('returns 204 as owner', async () => {
        const item = await insertItem(createRandomString(8))
        const request = createRequest()
        await request.authenticateAs(owner)
        await request
          .delete(`/api/v1/communities/${community.slug}/list-items/${segment}/${item.id}`)
          .expect(204)
      })
    })
  })
}
