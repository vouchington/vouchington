import { getWebLocalizationBatchClient } from '@/lib/api/client/localization'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRouteMessagesPromise, seedRouteMessages } from '../route-messages-cache'

const mockLoadMessages = vi.mocked(getWebLocalizationBatchClient)

describe('route message cache behavior', () => {
  beforeEach(() => {
    mockLoadMessages.mockReset()
  })

  it('keeps destination route loads separate within one locale', async () => {
    mockLoadMessages.mockResolvedValueOnce({
      contract: 'v1',
      revision: 'home',
      ttlSeconds: 60,
      messages: { 'nav.home': 'Home' },
    })
    mockLoadMessages.mockResolvedValueOnce({
      contract: 'v1',
      revision: 'notifications',
      ttlSeconds: 60,
      messages: { 'extracted.my.notifications.heading': 'Notifications' },
    })

    await expect(getRouteMessagesPromise('en', '/')).resolves.toEqual({
      nav: { home: 'Home' },
    })
    await expect(getRouteMessagesPromise('en', '/my/notifications')).resolves.toEqual({
      extracted: { my: { notifications: { heading: 'Notifications' } } },
    })
    expect(mockLoadMessages).toHaveBeenNthCalledWith(1, 'en', expect.any(Array))
    expect(mockLoadMessages).toHaveBeenNthCalledWith(2, 'en', expect.any(Array))
  })

  it('seeds only the selected locale and pathname', async () => {
    mockLoadMessages.mockResolvedValue({
      contract: 'v1',
      revision: 'other',
      ttlSeconds: 60,
      messages: { 'nav.home': 'Other route' },
    })
    seedRouteMessages('en', '/my/settings', { nav: { home: 'Seeded' } })

    await expect(getRouteMessagesPromise('en', '/my/settings')).resolves.toEqual({
      nav: { home: 'Seeded' },
    })
    await expect(getRouteMessagesPromise('en', '/my/profile')).resolves.toEqual({
      nav: { home: 'Other route' },
    })
    await expect(getRouteMessagesPromise('es', '/my/settings')).resolves.toEqual({
      nav: { home: 'Other route' },
    })
    expect(mockLoadMessages.mock.calls).toEqual([
      ['en', expect.any(Array)],
      ['es', expect.any(Array)],
    ])
  })
})
