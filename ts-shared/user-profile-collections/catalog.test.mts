import { describe, expect, it } from 'vitest'
import {
  PRIVATE_USER_PROFILE_COLLECTIONS,
  USER_PROFILE_COLLECTIONS,
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
    expect(
      USER_PROFILE_COLLECTIONS.filter(collection => collection.access === 'public').map(
        getProfileCollectionRouteSuffix,
      ),
    ).toEqual([
      'topics/following',
      'users/following',
      'users/followers',
      'rss-feeds/following',
      'communities/member',
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
