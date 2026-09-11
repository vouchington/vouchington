import { describe, expect, it } from 'vitest'
import { loadSW, makePushBindingMessage } from '../test-helpers/service-worker'

describe('service-worker push cleanup', () => {
  it('acknowledges clear after notification cleanup fails', async () => {
    const self = loadSW()
    const binding = {
      endpoint: 'https://push.example.test/subscription',
      subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d8f',
    }
    const initialize = makePushBindingMessage('read-or-initialize', binding)
    self.fire('message', initialize)
    await Promise.all(initialize._promises)

    self.registration.getNotifications.mockRejectedValueOnce(new Error('tray unavailable'))
    const clear = makePushBindingMessage('clear')
    self.fire('message', clear)
    await Promise.all(clear._promises)

    expect(clear.messages).toEqual([
      expect.objectContaining({
        type: 'voucha:web-push',
        version: 1,
        ok: true,
        state: expect.objectContaining({ status: 'disabled' }),
      }),
    ])
  })

  it('acknowledges clear when an exact notification cannot close', async () => {
    const self = loadSW()
    const binding = {
      endpoint: 'https://push.example.test/subscription',
      subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d8f',
    }
    const initialize = makePushBindingMessage('read-or-initialize', binding)
    self.fire('message', initialize)
    await Promise.all(initialize._promises)

    self.registration.getNotifications.mockResolvedValueOnce([
      {
        data: {
          web_push_endpoint: binding.endpoint,
          web_push_subscription_id: binding.subscription_id,
        },
        close() {
          throw new Error('notification already closed')
        },
      },
    ])
    const clear = makePushBindingMessage('clear')
    self.fire('message', clear)
    await Promise.all(clear._promises)

    expect(clear.messages).toEqual([
      expect.objectContaining({
        type: 'voucha:web-push',
        version: 1,
        ok: true,
        state: expect.objectContaining({ status: 'disabled' }),
      }),
    ])
  })
})
