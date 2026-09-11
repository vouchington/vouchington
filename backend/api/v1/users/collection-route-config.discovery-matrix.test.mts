/**
 * Reconciliation verifier: asserts that every private list type in the backend collection-route
 * config maps to a path that @ts-shared/route-classification classifies as private.
 *
 * This guard ensures the Cloudflare Worker discovery denylist stays aligned with backend
 * collection privacy — the exact drift that PR #4598 was forced to fix reactively.
 */
import { describe, expect, it } from 'vitest'

import { isPrivateDiscoveryPath } from '@ts-shared/route-classification'
import {
  PRIVATE_USER_PROFILE_COLLECTIONS,
  PUBLIC_USER_PROFILE_COLLECTIONS,
  getProfileCollectionRouteSuffix,
} from '@ts-shared/user-profile-collections'

import {
  POST_LIST_TYPES,
  PRIVATE_TOPIC_LIST_TYPES,
  PRIVATE_USER_LIST_TYPES,
  getCollectionRouteConfig,
} from './collection-route-config.mts'
import { POST_LIST_TABLES } from '@services/users/profile-collection-tables'

describe('route-classification reconciliation — backend collection privacy', () => {
  it('keeps the closed post relation table map aligned with the catalog route list', () => {
    expect(Object.keys(POST_LIST_TABLES).sort()).toEqual([...POST_LIST_TYPES].sort())
  })
  describe('PRIVATE_TOPIC_LIST_TYPES alignment', () => {
    it('every private topic list type resolves to a private discovery path', () => {
      const userId = 'user-id-123'
      const notPrivate = [...PRIVATE_TOPIC_LIST_TYPES].filter(
        listType => !isPrivateDiscoveryPath(`/user/${userId}/topics/${listType}`),
      )
      expect(notPrivate).toEqual([])
    })
  })

  describe('PRIVATE_USER_LIST_TYPES alignment', () => {
    it('every private user list type resolves to a private discovery path', () => {
      const userId = 'user-id-123'
      const notPrivate = [...PRIVATE_USER_LIST_TYPES].filter(
        listType => !isPrivateDiscoveryPath(`/user/${userId}/users/${listType}`),
      )
      expect(notPrivate).toEqual([])
    })
  })

  it('every catalog owner-only collection resolves to a private discovery path', () => {
    const userId = 'user-id-123'
    const notPrivate = PRIVATE_USER_PROFILE_COLLECTIONS.filter(
      collection =>
        !isPrivateDiscoveryPath(`/user/${userId}/${getProfileCollectionRouteSuffix(collection)}`),
    ).map(getProfileCollectionRouteSuffix)
    expect(notPrivate).toEqual([])
  })

  it('public catalog collection paths stay public for discovery', () => {
    const userId = 'user-id-123'
    const unexpectedlyPrivate = PUBLIC_USER_PROFILE_COLLECTIONS.filter(collection =>
      isPrivateDiscoveryPath(`/user/${userId}/${getProfileCollectionRouteSuffix(collection)}`),
    ).map(getProfileCollectionRouteSuffix)
    expect(unexpectedlyPrivate).toEqual([])
  })

  it('looks up catalog route config and rejects unknown collection routes', () => {
    expect(getCollectionRouteConfig('topics', 'following')).toMatchObject({
      routeSegment: 'topics',
      routeListType: 'following',
      access: 'public',
      visibilityField: 'topic_follows_visibility',
    })

    expect(() => getCollectionRouteConfig('topics', 'missing')).toThrow(
      'Missing user collection route config for topics/missing',
    )
  })
})
