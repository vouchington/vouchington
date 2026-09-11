import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  removeTestCommunityMember,
  insertTestCommunityListItem,
  insertTestTopic,
  createRandomString,
} from '@voucha/test-helpers'
import { searchCommunities } from '../search.mts'
import type { PrivateUser } from '@services/users/types'

describe('search (filters)', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('searchCommunities', () => {
    describe('listType filter', () => {
      it('filters by list_type=follow', async () => {
        const rand = createRandomString(8)
        const [followCommunity, muteCommunity, noCommunity] = await Promise.all([
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} Follow`,
            slug: `${rand}-flt-follow`,
            list_type: 'follow',
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} Mute`,
            slug: `${rand}-flt-mute`,
            list_type: 'mute',
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} None`,
            slug: `${rand}-flt-none`,
          }),
        ])

        const result = await searchCommunities({ listType: 'follow', search: rand })
        const ids = result.results.map(r => r.id)
        expect(ids).toContain(followCommunity.id)
        expect(ids).not.toContain(muteCommunity.id)
        expect(ids).not.toContain(noCommunity.id)
      })

      it('filters by list_type=mute', async () => {
        const rand = createRandomString(8)
        const [followCommunity, muteCommunity] = await Promise.all([
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} Follow`,
            slug: `${rand}-mlt-follow`,
            list_type: 'follow',
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} Mute`,
            slug: `${rand}-mlt-mute`,
            list_type: 'mute',
          }),
        ])

        const result = await searchCommunities({ listType: 'mute', search: rand })
        const ids = result.results.map(r => r.id)
        expect(ids).toContain(muteCommunity.id)
        expect(ids).not.toContain(followCommunity.id)
      })
    })

    describe('hasListType filter', () => {
      it('returns only communities with a list_type set', async () => {
        const rand = createRandomString(8)
        const [withType, withoutType] = await Promise.all([
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} WithType`,
            slug: `${rand}-hlt-with`,
            list_type: 'follow',
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} NoType`,
            slug: `${rand}-hlt-no`,
          }),
        ])

        const result = await searchCommunities({ hasListType: true, search: rand })
        const ids = result.results.map(r => r.id)
        expect(ids).toContain(withType.id)
        expect(ids).not.toContain(withoutType.id)
      })
    })

    describe('hasListItems filter', () => {
      it('returns only communities with list items', async () => {
        const rand = createRandomString(8)
        const [withItems, withoutItems] = await Promise.all([
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} Items`,
            slug: `${rand}-hli-items`,
            list_type: 'follow',
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} Empty`,
            slug: `${rand}-hli-empty`,
            list_type: 'mute',
          }),
        ])

        const topicId = await insertTestTopic({
          name: `Search Topic ${rand}`,
          slug: `search-topic-${rand}`,
          createdById: user.id,
        })
        await insertTestCommunityListItem({
          communityId: withItems.id,
          itemType: 'topic',
          entityId: topicId,
        })

        const result = await searchCommunities({ hasListItems: true, search: rand })
        const ids = result.results.map(r => r.id)
        expect(ids).toContain(withItems.id)
        expect(ids).not.toContain(withoutItems.id)
      })
    })

    describe('visibility filter', () => {
      it('returns only public communities when no currentUserId', async () => {
        const rand = createRandomString(8)
        const [publicCommunity, privateCommunity] = await Promise.all([
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} Public`,
            slug: `${rand}-vis-pub`,
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} Private`,
            slug: `${rand}-vis-priv`,
            visibility: 'private',
          }),
        ])

        const result = await searchCommunities({ search: rand })
        const ids = result.results.map(r => r.id)
        expect(ids).toContain(publicCommunity.id)
        expect(ids).not.toContain(privateCommunity.id)
      })

      it('returns private community when current user is an active member', async () => {
        const rand = createRandomString(8)
        const memberUser = await createTestUser()
        const privateCommunity = await insertTestCommunity({
          createdById: user.id,
          name: `${rand} PrivMember`,
          slug: `${rand}-vis-pm`,
          visibility: 'private',
        })
        await insertTestCommunityMember({ communityId: privateCommunity.id, userId: memberUser.id })

        const result = await searchCommunities({ currentUser: memberUser, search: rand })
        const ids = result.results.map(r => r.id)
        expect(ids).toContain(privateCommunity.id)
      })

      it('excludes private community when current user is not a member', async () => {
        const rand = createRandomString(8)
        const stranger = await createTestUser()
        const [publicCommunity, privateCommunity] = await Promise.all([
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} PubStranger`,
            slug: `${rand}-vis-ps`,
          }),
          insertTestCommunity({
            createdById: user.id,
            name: `${rand} PrivStranger`,
            slug: `${rand}-vis-prs`,
            visibility: 'private',
          }),
        ])

        const result = await searchCommunities({ currentUser: stranger, search: rand })
        const ids = result.results.map(r => r.id)
        expect(ids).toContain(publicCommunity.id)
        expect(ids).not.toContain(privateCommunity.id)
      })

      it('excludes private community when membership was removed', async () => {
        const rand = createRandomString(8)
        const removedUser = await createTestUser()
        const privateCommunity = await insertTestCommunity({
          createdById: user.id,
          name: `${rand} PrivRemoved`,
          slug: `${rand}-vis-pr`,
          visibility: 'private',
        })
        await insertTestCommunityMember({
          communityId: privateCommunity.id,
          userId: removedUser.id,
        })
        await removeTestCommunityMember(privateCommunity.id, removedUser.id)

        const result = await searchCommunities({ currentUser: removedUser, search: rand })
        const ids = result.results.map(r => r.id)
        expect(ids).not.toContain(privateCommunity.id)
      })

      it('returns all communities when current user is an administrator', async () => {
        const rand = createRandomString(8)
        const adminUser = await createTestUser({ administrator: true })
        const privateCommunity = await insertTestCommunity({
          createdById: user.id,
          name: `${rand} PrivAdmin`,
          slug: `${rand}-vis-pa`,
          visibility: 'private',
        })

        const result = await searchCommunities({ currentUser: adminUser, search: rand })
        const ids = result.results.map(r => r.id)
        expect(ids).toContain(privateCommunity.id)
      })

      it('memberUserId branch continues to return private communities', async () => {
        const rand = createRandomString(8)
        const memberUser = await createTestUser()
        const privateCommunity = await insertTestCommunity({
          createdById: user.id,
          name: `${rand} PrivMemberId`,
          slug: `${rand}-vis-pmi`,
          visibility: 'private',
        })
        await insertTestCommunityMember({ communityId: privateCommunity.id, userId: memberUser.id })

        const result = await searchCommunities({
          currentUser: memberUser,
          memberUserId: memberUser.id,
          search: rand,
        })
        const ids = result.results.map(r => r.id)
        expect(ids).toContain(privateCommunity.id)
      })
    })

    describe('validation', () => {
      it('throws 422 for non-integer limit', async () => {
        await expect(searchCommunities({ limit: 1.5 })).rejects.toMatchObject({ status: 422 })
      })

      it('throws 422 for limit out of range', async () => {
        await expect(searchCommunities({ limit: 0 })).rejects.toMatchObject({ status: 422 })
        await expect(searchCommunities({ limit: 101 })).rejects.toMatchObject({ status: 422 })
      })
    })
  })
})
