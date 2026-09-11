import { describe, expect, it, vi } from 'vitest'
import {
  loadSW,
  makeClickEvent,
  makeFetchEvent,
  makeInstallEvent,
  makeNullDataPushEvent,
  makePushBindingMessage,
  makePushEvent,
  scriptUrl,
} from '../test-helpers/service-worker'

describe('service-worker offline handler', () => {
  it('takes control when the installed worker activates', async () => {
    const self = loadSW()
    const event = makeInstallEvent()

    self.fire('activate', event)
    await Promise.all(event._promises)

    expect(self.clients.claim).toHaveBeenCalledOnce()
  })

  it('pre-caches the offline route on install', async () => {
    const add = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    const caches = {
      open: vi.fn<VitestLooseMock>().mockResolvedValue({ add }),
    }
    const self = loadSW('https://example.com', { caches })
    ;(self as unknown as { caches: typeof caches }).caches = caches
    const event = makeInstallEvent()

    self.fire('install', event)
    await Promise.all(event._promises)

    expect(caches.open).toHaveBeenCalledWith('voucha-offline-v1')
    expect(add).toHaveBeenCalledTimes(1)
    const request = add.mock.calls[0]?.[0] as Request
    expect(request.url).toBe('https://example.com/offline')
    expect(request.credentials).toBe('omit')
  })

  it('serves cached offline page when navigation fetch fails', async () => {
    const offlineResponse = new Response('offline page')
    const caches = {
      match: vi.fn<VitestLooseMock>().mockResolvedValue(offlineResponse),
    }
    const self = loadSW('https://example.com', {
      caches,
      fetch: vi.fn<VitestLooseMock>().mockRejectedValue(new Error('offline')),
    })
    ;(self as unknown as { caches: typeof caches }).caches = caches
    const request = new Request('https://example.com/page')
    Object.defineProperty(request, 'mode', { configurable: true, value: 'navigate' })
    const event = makeFetchEvent(request)

    self.fire('fetch', event)

    await expect(event.responsePromise).resolves.toBe(offlineResponse)
    expect(caches.match).toHaveBeenCalledWith('/offline')
  })
})

describe('service-worker push handler', () => {
  it('suppresses a push whose endpoint or generation does not match the durable binding', async () => {
    const self = loadSW()
    const binding = {
      endpoint: 'https://push.example.test/subscription',
      subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d8f',
    }
    const clear = makePushBindingMessage('clear')
    self.fire('message', clear)
    await Promise.all(clear._promises)
    const bind = makePushBindingMessage('bind', binding, getRevision(clear.messages))
    self.fire('message', bind)
    await Promise.all(bind._promises)

    const mismatched = makePushEvent({
      title: 'Do not display',
      web_push_endpoint: binding.endpoint,
      web_push_subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d8e',
    })
    self.fire('push', mismatched)
    await Promise.all(mismatched._promises)

    expect(self.registration.showNotification).not.toHaveBeenCalled()
  })

  it('shows notification with full payload', async () => {
    const self = loadSW()
    const binding = await bindPush(self)
    const event = makePushEvent({ title: 'Hello', body: 'World', url: '/page', ...binding })
    self.fire('push', event)
    await Promise.all(event._promises)
    expect(self.registration.showNotification).toHaveBeenCalledWith('Hello', {
      body: 'World',
      data: expect.objectContaining({ url: '/page' }),
    })
  })

  it('maps the notifications inbox intent to the web inbox route', async () => {
    const self = loadSW()
    const binding = await bindPush(self)
    const event = makePushEvent({
      title: 'Weekly activity',
      target_intent: 'notifications_inbox',
      notification_id: 'notification-1',
      ...binding,
    })
    self.fire('push', event)
    await Promise.all(event._promises)
    expect(self.registration.showNotification).toHaveBeenCalledWith('Weekly activity', {
      body: '',
      data: expect.objectContaining({ url: '/my/notifications' }),
    })
  })

  it('maps a structured community target to its safe slug route', async () => {
    const self = loadSW()
    const binding = await bindPush(self)
    const event = makePushEvent({
      title: 'Role changed',
      target_entity: { __entity_type: 'community', id: 'community-1', slug: 'safe slug' },
      ...binding,
    })
    self.fire('push', event)
    await Promise.all(event._promises)
    expect(self.registration.showNotification).toHaveBeenCalledWith('Role changed', {
      body: '',
      data: expect.objectContaining({ url: '/communities/safe%20slug' }),
    })
  })

  it('defaults title to Voucha when missing', async () => {
    const self = loadSW()
    const binding = await bindPush(self)
    const event = makePushEvent({ body: 'hi', ...binding })
    self.fire('push', event)
    await Promise.all(event._promises)
    expect(self.registration.showNotification).toHaveBeenCalledWith('Voucha', expect.anything())
  })

  it('defaults body to empty string and url to / when missing', async () => {
    const self = loadSW()
    const binding = await bindPush(self)
    const event = makePushEvent(binding)
    self.fire('push', event)
    await Promise.all(event._promises)
    expect(self.registration.showNotification).toHaveBeenCalledWith('Voucha', {
      body: '',
      data: expect.objectContaining({ url: '/' }),
    })
  })

  it('falls back to empty data when JSON parse throws', async () => {
    const self = loadSW()
    await bindPush(self)
    const event = makePushEvent(null, true)
    self.fire('push', event)
    await Promise.all(event._promises)
    expect(self.registration.showNotification).not.toHaveBeenCalled()
  })

  it('uses defaults when event.data is null', async () => {
    const self = loadSW()
    await bindPush(self)
    const event = makeNullDataPushEvent()
    self.fire('push', event)
    await Promise.all(event._promises)
    expect(self.registration.showNotification).not.toHaveBeenCalled()
  })
})

async function bindPush(self: ReturnType<typeof loadSW>) {
  const binding = {
    web_push_endpoint: 'https://push.example.test/subscription',
    web_push_subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d8f',
  }
  const clear = makePushBindingMessage('clear')
  self.fire('message', clear)
  await Promise.all(clear._promises)
  const bind = makePushBindingMessage(
    'bind',
    {
      endpoint: binding.web_push_endpoint,
      subscription_id: binding.web_push_subscription_id,
    },
    getRevision(clear.messages),
  )
  self.fire('message', bind)
  await Promise.all(bind._promises)
  return binding
}

function getRevision(messages: unknown[]): string {
  const response = messages[0] as { state?: { revision?: unknown } } | undefined
  if (typeof response?.state?.revision !== 'string') throw new Error('Missing worker revision')
  return response.state.revision
}

describe('service-worker notificationclick handler', () => {
  it('closes notification and opens new window when no clients exist', async () => {
    const self = loadSW()
    const event = makeClickEvent('/some-path')
    self.fire('notificationclick', event)
    await Promise.all(event._promises)
    expect(event.notification.close).toHaveBeenCalled()
    expect(self.clients.openWindow).toHaveBeenCalledWith('https://example.com/some-path')
  })

  it('navigates an existing client instead of opening a new window', async () => {
    const self = loadSW()
    const fakeClient = {
      focus: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      navigate: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
    }
    self.clients.matchAll = vi.fn<VitestLooseMock>().mockResolvedValue([fakeClient])
    const event = makeClickEvent('/other-path')
    self.fire('notificationclick', event)
    await Promise.all(event._promises)
    expect(event.notification.close).toHaveBeenCalled()
    expect(fakeClient.navigate).toHaveBeenCalledWith('https://example.com/other-path')
    expect(fakeClient.focus).toHaveBeenCalled()
    expect(self.clients.openWindow).not.toHaveBeenCalled()
  })

  it('falls back to openWindow when client has no focus method', async () => {
    const self = loadSW()
    self.clients.matchAll = vi
      .fn<() => unknown>()
      .mockResolvedValue([{ navigate: vi.fn<VitestLooseMock>() }])
    const event = makeClickEvent('/path')
    self.fire('notificationclick', event)
    await Promise.all(event._promises)
    expect(event.notification.close).toHaveBeenCalled()
    expect(self.clients.openWindow).toHaveBeenCalledWith('https://example.com/path')
  })

  it('drops click for cross-origin url', async () => {
    const self = loadSW()
    const event = makeClickEvent('https://evil.example.com/steal')
    self.fire('notificationclick', event)
    await Promise.all(event._promises)
    expect(event.notification.close).toHaveBeenCalled()
    expect(self.clients.openWindow).not.toHaveBeenCalled()
    expect(self.clients.matchAll).not.toHaveBeenCalled()
  })

  it('drops click for javascript: scheme', async () => {
    const self = loadSW()
    const event = makeClickEvent(scriptUrl)
    self.fire('notificationclick', event)
    await Promise.all(event._promises)
    expect(event.notification.close).toHaveBeenCalled()
    expect(self.clients.openWindow).not.toHaveBeenCalled()
  })

  it('drops click for data: scheme', async () => {
    const self = loadSW()
    const event = makeClickEvent('data:text/html,<h1>evil</h1>')
    self.fire('notificationclick', event)
    await Promise.all(event._promises)
    expect(event.notification.close).toHaveBeenCalled()
    expect(self.clients.openWindow).not.toHaveBeenCalled()
  })

  it('handles missing url with / fallback', async () => {
    const self = loadSW()
    const event = makeClickEvent(undefined)
    self.fire('notificationclick', event)
    await Promise.all(event._promises)
    expect(event.notification.close).toHaveBeenCalled()
    expect(self.clients.openWindow).toHaveBeenCalledWith('https://example.com/')
  })

  it('resolves relative paths against origin', async () => {
    const self = loadSW('https://app.voucha.ai')
    const event = makeClickEvent('/posts/123')
    self.fire('notificationclick', event)
    await Promise.all(event._promises)
    expect(event.notification.close).toHaveBeenCalled()
    expect(self.clients.openWindow).toHaveBeenCalledWith('https://app.voucha.ai/posts/123')
  })
})
