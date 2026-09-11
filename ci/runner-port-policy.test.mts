import { describe, expect, it } from 'vitest'
import { FETCH_FORBIDDEN_PORTS, isFetchSafePort } from '@ts-shared/utils/fetch-ports'
import { createTraceProxy } from '../integration-tests/web/helpers/backend-trace-proxy.mts'
import {
  allocateReservedPorts,
  isFetchSafeUnreservedPort,
  listenOnFetchSafeEphemeralPort,
} from '../integration-tests/web/helpers/ports.mts'
import {
  isRunnerReservedPort,
  listenOnRunnerUnreservedEphemeralPort,
  runnerPortPolicy,
} from './runner-port-policy.mts'

describe('runner port policy consumers', () => {
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

  it('rejects an explicit Fetch-forbidden trace proxy port before binding', async () => {
    await expect(createTraceProxy(4045, 'http://127.0.0.1:4046')).rejects.toThrow(
      'Trace proxy port 4045 is forbidden by Fetch',
    )
  })

  it('releases disallowed reservations and returns the next safe port', async () => {
    for (const disallowedPort of [4045, 2200]) {
      let disallowedReservationReleased = false
      const candidates = [
        {
          port: disallowedPort,
          release: async () => {
            disallowedReservationReleased = true
          },
        },
        { port: 4046, release: async () => undefined },
      ]

      const reservations = await allocateReservedPorts(1, async () => {
        const candidate = candidates.shift()
        if (!candidate) throw new Error('Test reservation candidates exhausted')
        return [candidate]
      })

      expect(disallowedReservationReleased).toBe(true)
      expect(reservations).toHaveLength(1)
      expect(reservations[0]?.port).toBe(4046)
    }
  })

  it('retries a reserved port before returning a Fetch-safe ephemeral listener', async () => {
    const boundPorts = [2200, 4045, 4046]
    const server = {
      address: () => ({ address: '127.0.0.1', family: 'IPv4', port: boundPorts[0] }),
      close: (callback: (error?: Error) => void) => callback(),
    }
    const listen = async () => {
      const port = boundPorts.shift()
      if (port == null) throw new Error('Test listener candidates exhausted')
      server.address = () => ({ address: '127.0.0.1', family: 'IPv4', port })
    }

    await expect(
      listenOnFetchSafeEphemeralPort(server as unknown as import('node:net').Server, listen),
    ).resolves.toBe(4046)
    expect(isFetchSafeUnreservedPort(2200)).toBe(false)
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

  it('releases held safe reservations when replacement allocation fails', async () => {
    const releasedPorts: number[] = []
    let allocationAttempts = 0

    await expect(
      allocateReservedPorts(3, async () => {
        allocationAttempts += 1
        if (allocationAttempts === 1) {
          return [4046, 4047].map(port => ({
            port,
            release: async () => {
              releasedPorts.push(port)
            },
          }))
        }
        throw new Error('replacement allocation failed')
      }),
    ).rejects.toThrow('replacement allocation failed')

    expect(releasedPorts).toEqual([4046, 4047])
  })

  it('releases held safe reservations when a forbidden candidate cannot be released', async () => {
    const releasedPorts: number[] = []

    await expect(
      allocateReservedPorts(3, async () => [
        ...[4046, 4047].map(port => ({
          port,
          release: async () => {
            releasedPorts.push(port)
          },
        })),
        {
          port: 4045,
          release: async () => {
            throw new Error('forbidden release failed')
          },
        },
      ]),
    ).rejects.toThrow('forbidden release failed')

    expect(releasedPorts).toEqual([4046, 4047])
  })
})
