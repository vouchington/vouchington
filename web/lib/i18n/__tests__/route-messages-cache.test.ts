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

  it('seeds only the selected locale and pathname', async () => {
    const loadMessages = vi.fn<(locale: string, pathname: string) => Promise<EnCatalog>>()
    loadMessages.mockResolvedValue({ nav: { home: 'Other route' } })
    const cache = createRouteMessagesCache(loadMessages)
    cache.seedMessages('en', '/seeded', { nav: { home: 'Seeded' } })
    await expect(cache.getMessagesPromise('en', '/seeded')).resolves.toEqual({
      nav: { home: 'Seeded' },
    })
    await expect(cache.getMessagesPromise('en', '/other')).resolves.toEqual({
      nav: { home: 'Other route' },
    })
    await expect(cache.getMessagesPromise('es', '/seeded')).resolves.toEqual({
      nav: { home: 'Other route' },
    })
    expect(loadMessages.mock.calls).toEqual([
      ['en', '/other'],
      ['es', '/seeded'],
    ])
  })
})
