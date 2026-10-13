import net from 'node:net'
import { describe, expect, it } from 'vitest'
import {
  EphemeralListenerAttemptsExhaustedError,
  listenOnEphemeralPort,
  listenOnLoopbackEphemeralPort,
} from './ephemeral-ports.mts'

function loopbackServer() {
  return {
    address: () => ({ address: '127.0.0.1', family: 'IPv4', port: 4047 }),
    close: (callback: (error?: Error) => void) => callback(),
  } as unknown as net.Server
}

function bindError(code: string): Error {
  return Object.assign(new Error(`listen ${code}`), { code })
}

describe('listenOnLoopbackEphemeralPort', () => {
  it('prefers IPv6 loopback', async () => {
    const hosts: string[] = []
    await expect(
      listenOnLoopbackEphemeralPort(loopbackServer(), {
        listen: async (_server, host) => void hosts.push(host),
      }),
    ).resolves.toEqual({ host: '::1', port: 4047 })
    expect(hosts).toEqual(['::1'])
  })

  it('falls back to IPv4 loopback when the host has no IPv6 support', async () => {
    const hosts: string[] = []
    const listen = async (_server: net.Server, host: string) => {
      hosts.push(host)
      if (host === '::1') throw bindError('EAFNOSUPPORT')
    }
    await expect(listenOnLoopbackEphemeralPort(loopbackServer(), { listen })).resolves.toEqual({
      host: '127.0.0.1',
      port: 4047,
    })
    expect(hosts).toEqual(['::1', '127.0.0.1'])
  })

  it('rethrows other IPv6 bind failures', async () => {
    await expect(
      listenOnLoopbackEphemeralPort(loopbackServer(), {
        listen: async () => {
          throw bindError('EADDRINUSE')
        },
      }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' })
  })
})

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

  it('rejects when the server reports no bound address after listening', async () => {
    const server = {
      address: () => null,
      close: (callback: (error?: Error) => void) => callback(),
    }

    await expect(
      listenOnEphemeralPort(server as unknown as net.Server, '127.0.0.1', {
        listen: async () => undefined,
      }),
    ).rejects.toThrow('Failed to allocate listener port')
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
