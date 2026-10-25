import { afterEach, describe, expect, it, vi } from 'vitest'
import { markMyNotificationReadKeepalive } from '../my-notifications'

describe('markMyNotificationReadKeepalive', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends a keepalive read receipt that can finish after navigation', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(markMyNotificationReadKeepalive('n1')).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/my/notifications/n1', {
      method: 'PATCH',
      body: JSON.stringify({ is_read: true }),
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
    })
  })

  it('rejects a bot challenge response for background reporting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 403 })),
    )

    await expect(markMyNotificationReadKeepalive('n1')).rejects.toThrow(
      'Notification read receipt failed (403)',
    )
  })
})
