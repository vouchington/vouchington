import { describe, it, expect, afterEach, vi } from 'vitest'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { caches } from '@services/entity-cache/caches'
import { clearAllCaches, clearCacheGroup, getCacheGroups } from './clear-cache.mts'
import { CACHE_FLUSH_PREFIXES } from './flush-targets.mts'

const invalidateManyMock = vi.spyOn(ValkeyCache, 'invalidateMany')

describe('getCacheGroups', () => {
  it('returns all expected cache groups', () => {
    const groups = getCacheGroups()
    const names = groups.map(g => g.name)
    expect(names).toContain('users')
    expect(names).toContain('topics')
    expect(names).toContain('posts')
    expect(names).toContain('rss')
    expect(names).toContain('urls')
    expect(names).toContain('elections')
    expect(groups).toHaveLength(6)
  })

  it('returns correct prefixes for users group', () => {
    const groups = getCacheGroups()
    const usersGroup = groups.find(g => g.name === 'users')
    expect(usersGroup).toBeDefined()
    expect(usersGroup!.prefixes).toEqual([
      'users_private',
      'users_public',
      'users_lookup',
      'user_metrics',
    ])
  })

  it('returns correct prefixes for posts group', () => {
    const groups = getCacheGroups()
    const postsGroup = groups.find(g => g.name === 'posts')
    expect(postsGroup).toBeDefined()
    expect(postsGroup!.prefixes).toEqual([
      'posts',
      'posts_lookup',
      'post_metrics',
      'post_elections',
    ])
  })

  it('covers every production entity cache exactly once', () => {
    expect(new Set(CACHE_FLUSH_PREFIXES).size).toBe(CACHE_FLUSH_PREFIXES.length)
    expect([...CACHE_FLUSH_PREFIXES].sort()).toEqual(Object.keys(caches).sort())
  })
})

describe('cache clearing', () => {
  afterEach(() => {
    invalidateManyMock.mockReset()
  })

  it('invalidates every prefix in one call for a selected group', async () => {
    invalidateManyMock.mockResolvedValue(undefined)

    await clearCacheGroup('users')

    expect(invalidateManyMock).toHaveBeenCalledTimes(1)
    expect(invalidateManyMock).toHaveBeenCalledWith(
      ['users_private', 'users_public', 'users_lookup', 'user_metrics'],
      cacheValkeyClient,
    )
  })

  it('invalidates every configured prefix in one call for all groups', async () => {
    invalidateManyMock.mockResolvedValue(undefined)
    const prefixes = getCacheGroups().flatMap(group => group.prefixes)

    await clearAllCaches()

    expect(invalidateManyMock).toHaveBeenCalledTimes(1)
    expect(invalidateManyMock).toHaveBeenCalledWith(prefixes, cacheValkeyClient)
  })

  it('rejects an invalid cache group with status 400', async () => {
    await expect(clearCacheGroup('invalid')).rejects.toMatchObject({ status: 400 })
    expect(invalidateManyMock).not.toHaveBeenCalled()
  })

  it('reports and rethrows cache invalidation failures', async () => {
    const error = new Error('Valkey unavailable')
    invalidateManyMock.mockRejectedValue(error)

    await expect(clearCacheGroup('users')).rejects.toBe(error)
  })
})
