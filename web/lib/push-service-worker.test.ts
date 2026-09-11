import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginPushBindingReconciliation,
  bindPushBinding,
  clearPushBinding,
} from './push-service-worker'

type MessageHandler = ((event: MessageEvent) => void) | null

class TestMessageChannel {
  port1 = { onmessage: null as MessageHandler, close: vi.fn<VitestLooseMock>() }
  port2 = {
    postMessage: (data: unknown) => this.port1.onmessage?.({ data } as MessageEvent),
    close: vi.fn<VitestLooseMock>(),
  }
}

const binding = {
  endpoint: 'https://push.example.test/current',
  subscription_id: '018f95dd-2abd-7c66-9cdd-563a7fa44d8f',
}
const revision = 'revision-1'

function registrationWithReply(reply?: (port: TestMessageChannel['port2']) => void) {
  const active = {
    postMessage: vi.fn<VitestLooseMock>((_request, ports: TestMessageChannel['port2'][]) => {
      if (reply) reply(ports[0]!)
    }),
  }
  return { active, waiting: { postMessage: vi.fn<VitestLooseMock>() } } as unknown as
    | ServiceWorkerRegistration
    | (ServiceWorkerRegistration & { waiting: { postMessage: ReturnType<typeof vi.fn> } })
}

describe('push service worker protocol', () => {
  beforeEach(() => {
    vi.stubGlobal('MessageChannel', TestMessageChannel)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('targets the active worker and accepts an exact bind acknowledgement', async () => {
    const registration = registrationWithReply(port =>
      port.postMessage({
        type: 'voucha:web-push',
        version: 1,
        ok: true,
        state: { status: 'bound', binding, revision },
      }),
    )

    await expect(bindPushBinding(registration, binding, revision)).resolves.toEqual({
      status: 'bound',
      binding,
      revision,
    })
    expect(registration.active?.postMessage).toHaveBeenCalledWith(
      {
        type: 'voucha:web-push',
        version: 1,
        action: 'bind',
        binding,
        expected_revision: revision,
      },
      [expect.anything()],
    )
    expect(registration.waiting?.postMessage).not.toHaveBeenCalled()
  })

  it('rejects a bind acknowledgement for a different generation', async () => {
    const registration = registrationWithReply(port =>
      port.postMessage({
        type: 'voucha:web-push',
        version: 1,
        ok: true,
        state: {
          status: 'bound',
          binding: { ...binding, subscription_id: crypto.randomUUID() },
          revision,
        },
      }),
    )

    await expect(bindPushBinding(registration, binding, revision)).rejects.toThrow(
      'service worker rejected',
    )
  })

  it('rejects a malformed clear state instead of treating a truthy payload as an ACK', async () => {
    const registration = registrationWithReply(port =>
      port.postMessage({
        type: 'voucha:web-push',
        version: 1,
        ok: true,
        state: { status: 'disabled', binding: { endpoint: binding.endpoint } },
      }),
    )

    await expect(clearPushBinding(registration)).rejects.toThrow('service worker rejected')
  })

  it('accepts only an explicit reconciliation barrier acknowledgement', async () => {
    const registration = registrationWithReply(port =>
      port.postMessage({
        type: 'voucha:web-push',
        version: 1,
        ok: true,
        state: { status: 'reconciling', binding, revision },
      }),
    )

    await expect(beginPushBindingReconciliation(registration)).resolves.toEqual({
      status: 'reconciling',
      binding,
      revision,
    })
    expect(registration.active?.postMessage).toHaveBeenCalledWith(
      { type: 'voucha:web-push', version: 1, action: 'begin-reconciliation' },
      [expect.anything()],
    )
  })

  it('fails closed after five seconds without an acknowledgement', async () => {
    vi.useFakeTimers()
    const result = bindPushBinding(registrationWithReply(), binding, revision).catch(error => error)

    await vi.advanceTimersByTimeAsync(5000)

    const error = await result
    expect(error).toBeInstanceOf(Error)
    expect(error).toHaveProperty('message', expect.stringContaining('did not acknowledge'))
  })
})
