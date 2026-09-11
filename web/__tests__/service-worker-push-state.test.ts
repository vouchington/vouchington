import { describe, expect, it, vi } from 'vitest'
import {
  createMemoryIndexedDb,
  loadSW,
  makePushBindingMessage,
  makePushEvent,
} from '../test-helpers/service-worker'

describe('service-worker push state', () => {
  it('suppresses pushes until an exact binding is initialized', async () => {
    const self = loadSW()
    const generation = makePushEvent({
      title: 'Unbound generation',
      web_push_endpoint: 'https://push.example.test/subscription',
      web_push_subscription_id: crypto.randomUUID(),
    })
    const unidentified = makePushEvent({ title: 'Unidentified payload' })

    self.fire('push', generation)
    self.fire('push', unidentified)
    await Promise.all([...generation._promises, ...unidentified._promises])

    expect(self.registration.showNotification).not.toHaveBeenCalled()
  })

  it('suppresses field-less payloads after binding', async () => {
    const self = loadSW()
    await bindPush(self)
    const event = makePushEvent({ title: 'Missing generation' })

    self.fire('push', event)
    await Promise.all(event._promises)

    expect(self.registration.showNotification).not.toHaveBeenCalled()
  })

  it('initializes an absent binding once and preserves it across worker restarts', async () => {
    const indexedDB = createMemoryIndexedDb()
    const binding = {
      endpoint: 'https://push.example.test/original',
      subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d8f',
    }
    const first = loadSW('https://example.com', { indexedDB })
    const initialize = makePushBindingMessage('read-or-initialize', binding)
    first.fire('message', initialize)
    await Promise.all(initialize._promises)

    const restarted = loadSW('https://example.com', { indexedDB })
    const replacement = makePushBindingMessage('read-or-initialize', {
      endpoint: 'https://push.example.test/replacement',
      subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d80',
    })
    restarted.fire('message', replacement)
    await Promise.all(replacement._promises)

    expect(replacement.messages).toEqual([
      {
        type: 'voucha:web-push',
        version: 1,
        ok: true,
        state: { status: 'bound', binding, revision: expect.any(String) },
      },
    ])
  })

  it('persists a disabled tombstone and never reinitializes it after restart', async () => {
    const indexedDB = createMemoryIndexedDb()
    const first = loadSW('https://example.com', { indexedDB })
    await bindPush(first)
    const clear = makePushBindingMessage('clear')
    first.fire('message', clear)
    await Promise.all(clear._promises)

    const restarted = loadSW('https://example.com', { indexedDB })
    const initialize = makePushBindingMessage('read-or-initialize', {
      endpoint: 'https://push.example.test/replacement',
      subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d80',
    })
    restarted.fire('message', initialize)
    await Promise.all(initialize._promises)

    expect(initialize.messages).toEqual([
      {
        type: 'voucha:web-push',
        version: 1,
        ok: true,
        state: {
          status: 'disabled',
          revision: expect.any(String),
          binding: {
            endpoint: 'https://push.example.test/subscription',
            subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d8f',
          },
        },
      },
    ])
  })

  it('persists a retryable reconciliation barrier separately from a disabled tombstone', async () => {
    const indexedDB = createMemoryIndexedDb()
    const first = loadSW('https://example.com', { indexedDB })
    await bindPush(first)
    const reconcile = makePushBindingMessage('begin-reconciliation')
    first.fire('message', reconcile)
    await Promise.all(reconcile._promises)

    const restarted = loadSW('https://example.com', { indexedDB })
    const read = makePushBindingMessage('read-or-initialize')
    restarted.fire('message', read)
    await Promise.all(read._promises)

    expect(read.messages).toEqual([
      {
        type: 'voucha:web-push',
        version: 1,
        ok: true,
        state: {
          status: 'reconciling',
          revision: expect.any(String),
          binding: {
            endpoint: 'https://push.example.test/subscription',
            subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d8f',
          },
        },
      },
    ])
  })

  it('preserves bound notifications during same-user reconciliation', async () => {
    const self = loadSW()
    const binding = await bindPush(self)
    const notification = { close: vi.fn<VitestLooseMock>(), data: binding }
    self.registration.getNotifications.mockClear()
    self.registration.getNotifications.mockResolvedValueOnce([notification])
    const reconcile = makePushBindingMessage('begin-reconciliation')

    self.fire('message', reconcile)
    await Promise.all(reconcile._promises)

    expect(notification.close).not.toHaveBeenCalled()
    expect(self.registration.getNotifications).not.toHaveBeenCalled()
  })

  it('displays matching generations during reconciliation but rejects mismatches', async () => {
    const self = loadSW()
    const binding = await bindPush(self)
    const reconcile = makePushBindingMessage('begin-reconciliation')
    self.fire('message', reconcile)
    await Promise.all(reconcile._promises)

    const matching = makePushEvent({ title: 'Matching', ...binding })
    const mismatched = makePushEvent({
      title: 'Mismatched',
      web_push_endpoint: binding.web_push_endpoint,
      web_push_subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d80',
    })
    self.fire('push', matching)
    self.fire('push', mismatched)
    await Promise.all([...matching._promises, ...mismatched._promises])

    expect(self.registration.showNotification).toHaveBeenCalledOnce()
    expect(self.registration.showNotification).toHaveBeenCalledWith('Matching', expect.anything())
  })

  it('clear closes only the exact generation and preserves other notifications', async () => {
    const matching = { close: vi.fn<VitestLooseMock>(), data: {} as Record<string, string> }
    const unidentified = { close: vi.fn<VitestLooseMock>(), data: {} }
    const other = {
      close: vi.fn<VitestLooseMock>(),
      data: {
        web_push_endpoint: 'https://push.example.test/other',
        web_push_subscription_id: crypto.randomUUID(),
      },
    }
    const self = loadSW()
    const binding = await bindPush(self)
    matching.data = binding
    self.registration.getNotifications.mockResolvedValueOnce([matching, unidentified, other])
    const clear = makePushBindingMessage('clear')

    self.fire('message', clear)
    await Promise.all(clear._promises)

    expect(matching.close).toHaveBeenCalledOnce()
    expect(unidentified.close).not.toHaveBeenCalled()
    expect(other.close).not.toHaveBeenCalled()
  })

  it('serializes push and clear work and drops pushes queued after the tombstone', async () => {
    const self = loadSW()
    const binding = await bindPush(self)
    const before = makePushEvent({ title: 'Before clear', ...binding })
    const clear = makePushBindingMessage('clear')
    const after = makePushEvent({ title: 'After clear', ...binding })

    self.fire('push', before)
    self.fire('message', clear)
    self.fire('push', after)
    await Promise.all([...before._promises, ...clear._promises, ...after._promises])

    expect(self.registration.showNotification).toHaveBeenCalledTimes(1)
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      'Before clear',
      expect.anything(),
    )
  })

  it('rejects unsupported binding protocol messages', async () => {
    const self = loadSW()
    const message = makePushBindingMessage('bind')
    message.data.version = 2

    self.fire('message', message)
    await Promise.all(message._promises)

    expect(message.messages).toEqual([
      expect.objectContaining({ type: 'voucha:web-push', version: 1, ok: false }),
    ])
  })

  it('rejects a stale bind after a newer authentication boundary supersedes its barrier', async () => {
    const self = loadSW()
    const firstClear = makePushBindingMessage('clear')
    self.fire('message', firstClear)
    await Promise.all(firstClear._promises)
    const firstRevision = getRevision(firstClear.messages)

    const secondClear = makePushBindingMessage('clear')
    self.fire('message', secondClear)
    await Promise.all(secondClear._promises)
    const secondRevision = getRevision(secondClear.messages)

    const binding = {
      endpoint: 'https://push.example.test/current',
      subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d8f',
    }
    const staleBind = makePushBindingMessage('bind', binding, firstRevision)
    self.fire('message', staleBind)
    await Promise.all(staleBind._promises)
    expect(staleBind.messages).toEqual([
      expect.objectContaining({ type: 'voucha:web-push', version: 1, ok: false }),
    ])

    const currentBind = makePushBindingMessage('bind', binding, secondRevision)
    self.fire('message', currentBind)
    await Promise.all(currentBind._promises)
    expect(currentBind.messages).toEqual([
      {
        type: 'voucha:web-push',
        version: 1,
        ok: true,
        state: { status: 'bound', binding, revision: secondRevision },
      },
    ])
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
