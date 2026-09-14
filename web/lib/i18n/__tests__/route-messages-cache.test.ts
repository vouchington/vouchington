import type { EnCatalog } from '@ts-shared/ui-messages'
import { describe, expect, it, vi } from 'vitest'
import { createRouteMessagesCache } from '../route-messages-cache'

describe('createRouteMessagesCache', () => {
  it('keeps destination route loads separate within one locale', async () => {
    const loadMessages = vi.fn<(locale: string, pathname: string) => Promise<EnCatalog>>()
    loadMessages.mockResolvedValueOnce({ nav: { home: 'Home' } })
    loadMessages.mockResolvedValueOnce({
      extracted: { my: { notifications: { heading: 'Notifications' } } },
    })
    const cache = createRouteMessagesCache(loadMessages)

    await expect(cache.getMessagesPromise('en', '/')).resolves.toEqual({ nav: { home: 'Home' } })
    await expect(cache.getMessagesPromise('en', '/my/notifications')).resolves.toEqual({
      extracted: { my: { notifications: { heading: 'Notifications' } } },
    })
    expect(loadMessages).toHaveBeenNthCalledWith(1, 'en', '/')
    expect(loadMessages).toHaveBeenNthCalledWith(2, 'en', '/my/notifications')
  })

  it('retains a rejected route promise until an explicit retry and accepts a later seed', async () => {
    const loadMessages = vi.fn<(locale: string, pathname: string) => Promise<EnCatalog>>()
    loadMessages.mockRejectedValueOnce(new Error('localization unavailable'))
    loadMessages.mockResolvedValueOnce({ nav: { home: 'Home' } })
    const cache = createRouteMessagesCache(loadMessages)

    const failed = cache.getMessagesPromise('en', '/my/notifications')
    await expect(failed).rejects.toThrow('localization unavailable')
    expect(cache.getMessagesPromise('en', '/my/notifications')).toBe(failed)
    expect(loadMessages).toHaveBeenCalledTimes(1)

    cache.invalidateMessages('en', '/my/notifications')
    await expect(cache.getMessagesPromise('en', '/my/notifications')).resolves.toEqual({
      nav: { home: 'Home' },
    })
    expect(loadMessages).toHaveBeenCalledTimes(2)

    const failedSeed = createRouteMessagesCache(() =>
      Promise.reject(new Error('localization unavailable')),
    )
    await expect(failedSeed.getMessagesPromise('en', '/my/notifications')).rejects.toThrow(
      'localization unavailable',
    )
    failedSeed.seedMessages('en', '/my/notifications', { nav: { home: 'Home' } })
    await expect(failedSeed.getMessagesPromise('en', '/my/notifications')).resolves.toEqual({
      nav: { home: 'Home' },
    })
  })
})
