import { describe, expect, it } from 'vitest'
import { FETCH_FORBIDDEN_PORTS, isFetchSafePort } from '@ts-shared/utils/fetch-ports'
import {
  isRunnerReservedPort,
  listenOnRunnerUnreservedEphemeralPort,
  runnerPortPolicy,
} from './runner-port-policy.mts'

describe('runner port policy', () => {
  it('loads the policy once and recognizes its entire reserved range', () => {
    expect(runnerPortPolicy).toMatchObject({ reservedPortStart: 2200, reservedPortEnd: 2999 })
    expect(isRunnerReservedPort(2199)).toBe(false)
    expect(isRunnerReservedPort(2200)).toBe(true)
    expect(isRunnerReservedPort(2999)).toBe(true)
    expect(isRunnerReservedPort(3000)).toBe(false)
  })

  it('rejects every canonical Fetch-forbidden port from TypeScript reservations', () => {
    expect(FETCH_FORBIDDEN_PORTS).toContain(4045)
    for (const forbiddenPort of FETCH_FORBIDDEN_PORTS) {
      expect(isFetchSafePort(forbiddenPort)).toBe(false)
    }
    expect(isFetchSafePort(4046)).toBe(true)
  })

  it('releases a reserved candidate before returning a repository listener', async () => {
    const boundPorts = [2200, 4046]
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
      listenOnRunnerUnreservedEphemeralPort(
        server as unknown as import('node:net').Server,
        '127.0.0.1',
        { listen },
      ),
    ).resolves.toBe(4046)
    expect(releasedCandidates).toBe(1)
  })

  it('honors a caller-specific listener attempt budget', async () => {
    const server = {
      address: () => ({ address: '127.0.0.1', family: 'IPv4', port: 2200 }),
      close: (callback: (error?: Error) => void) => callback(),
    }

    await expect(
      listenOnRunnerUnreservedEphemeralPort(
        server as unknown as import('node:net').Server,
        '127.0.0.1',
        { listen: async () => undefined, maxBindAttempts: 1 },
      ),
    ).rejects.toMatchObject({
      maxBindAttempts: 1,
      name: 'EphemeralListenerAttemptsExhaustedError',
    })
  })
})
