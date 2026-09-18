import net from 'node:net'
import { describe, expect, it } from 'vitest'
import {
  EphemeralListenerAttemptsExhaustedError,
  listenOnEphemeralPort,
} from './ephemeral-ports.mts'

describe('listenOnEphemeralPort', () => {
  it('binds a real server to a plain ephemeral port with no predicate', async () => {
    const server = net.createServer()
    const port = await listenOnEphemeralPort(server, '127.0.0.1')
    expect(port).toBeGreaterThan(0)
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  it('retries a rejected candidate before returning an allowed port', async () => {
    const boundPorts = [4045, 4046]
    let releasedCandidates = 0
    const server = {
      address: () => ({ address: '127.0.0.1', family: 'IPv4', port: boundPorts[0] }),
      close: (callback: (error?: Error) => void) => {
        releasedCandidates += 1
        callback()
      },
    }
    const listen = async () => {
      const port = boundPorts.shift()
      if (port == null) throw new Error('Test listener candidates exhausted')
      server.address = () => ({ address: '127.0.0.1', family: 'IPv4', port })
    }

    await expect(
      listenOnEphemeralPort(server as unknown as net.Server, '127.0.0.1', {
        isAllowedPort: port => port !== 4045,
        listen,
      }),
    ).resolves.toBe(4046)
    expect(releasedCandidates).toBe(1)
  })

  it('honors a caller-specific listener attempt budget', async () => {
    const server = {
      address: () => ({ address: '127.0.0.1', family: 'IPv4', port: 4045 }),
      close: (callback: (error?: Error) => void) => callback(),
    }

    await expect(
      listenOnEphemeralPort(server as unknown as net.Server, '127.0.0.1', {
        isAllowedPort: () => false,
        listen: async () => undefined,
        maxBindAttempts: 1,
      }),
    ).rejects.toMatchObject({
      maxBindAttempts: 1,
      name: 'EphemeralListenerAttemptsExhaustedError',
    })
    await expect(
      listenOnEphemeralPort(server as unknown as net.Server, '127.0.0.1', {
        isAllowedPort: () => false,
        listen: async () => undefined,
        maxBindAttempts: 1,
      }),
    ).rejects.toBeInstanceOf(EphemeralListenerAttemptsExhaustedError)
  })
})
