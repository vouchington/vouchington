import { describe, expect, it } from 'vitest'
import {
  PRIVATE_USER_PROFILE_COLLECTIONS,
  PUBLIC_USER_PROFILE_COLLECTIONS,
  USER_PROFILE_COLLECTIONS,
  getProfileCollectionRouteSuffixes,
  getProfileCollectionsByRouteSegment,
  getProfileCollectionRouteSuffix,
} from './catalog.mts'

describe('@ts-shared/user-profile-collections catalog', () => {
  it('has unique IDs and route suffixes', () => {
    const ids = USER_PROFILE_COLLECTIONS.map(collection => collection.id)
    const routeSuffixes = USER_PROFILE_COLLECTIONS.map(getProfileCollectionRouteSuffix)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(routeSuffixes).size).toBe(routeSuffixes.length)
  })

  it('keeps current public profile collection routes explicit', () => {
    expect(PUBLIC_USER_PROFILE_COLLECTIONS.map(getProfileCollectionRouteSuffix)).toEqual([
      'topics/following',
      'users/following',
      'users/followers',
      'rss-feeds/following',
      'communities/member',
    ])
  })

  it('derives route suffix helpers from the catalog', () => {
    expect(getProfileCollectionRouteSuffixes()).toEqual(
      USER_PROFILE_COLLECTIONS.map(getProfileCollectionRouteSuffix),
    )
    expect(getProfileCollectionRouteSuffixes([USER_PROFILE_COLLECTIONS[0]])).toEqual([
      'posts/saved',
    ])
    expect(
      getProfileCollectionsByRouteSegment('rss-feeds').map(getProfileCollectionRouteSuffix),
    ).toEqual([
      'rss-feeds/following',
      'rss-feeds/subscribed',
      'rss-feeds/muted',
      'rss-feeds/viewed',
    ])
  })

  it('defines relation metadata for relation-backed collections', () => {
    const missingRelationMetadata = USER_PROFILE_COLLECTIONS.filter(
      collection => collection.managementTab && !collection.recentView && !collection.relation,
    )
    expect(missingRelationMetadata).toEqual([])

    const badTableNames = USER_PROFILE_COLLECTIONS.filter(collection => {
      if (!collection.relation) return false
      return (
        collection.relation.tableName !==
        `relation__user__${collection.relation.predicate}__${collection.relation.entityType}`
      )
    }).map(collection => collection.id)
    expect(badTableNames).toEqual([])
  })

  it('defines private metric keys for every owner-only collection', () => {
    const badMetrics = PRIVATE_USER_PROFILE_COLLECTIONS.filter(
      collection => collection.metricGroup !== 'private_count' || !collection.metricKey,
    ).map(collection => collection.id)
    expect(badMetrics).toEqual([])
  })

  it('defines action metadata for actionable collection tabs', () => {
    const actionless = USER_PROFILE_COLLECTIONS.filter(
      collection => collection.managementTab && !collection.recentView && !collection.action,
    ).map(collection => collection.id)
    expect(actionless).toEqual(['topics-following', 'users-following', 'users-followers'])
  })
})
