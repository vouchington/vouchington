import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { Server } from 'node:net'
import { describe, expect, it } from 'vitest'
import { allocateReservedPorts, listenOnFetchSafeEphemeralPort } from '../helpers/ports.mts'

function kernelEphemeralPortRange(): { first: number; last: number } {
  if (process.platform === 'linux') {
    const text = readFileSync('/proc/sys/net/ipv4/ip_local_port_range', 'utf8').trim()
    const match = /^(\d+)\s+(\d+)$/.exec(text)
    if (!match) throw new Error(`Unreadable kernel ephemeral port range: ${text}`)
    return { first: Number(match[1]), last: Number(match[2]) }
  }
  if (process.platform === 'darwin') {
    const readSysctl = (name: string): number =>
      Number(execFileSync('sysctl', ['-n', name], { encoding: 'utf8' }).trim())
    return {
      first: readSysctl('net.inet.ip.portrange.first'),
      last: readSysctl('net.inet.ip.portrange.last'),
    }
  }
  throw new Error(`Cannot read the kernel ephemeral port range on ${process.platform}`)
}

describe('web integration test port helpers', () => {
  it('releases a disallowed reservation and returns the next safe port', async () => {
    let disallowedReservationReleased = false
    const candidates = [
      {
        port: 4045,
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
  })

  it('retries a Fetch-forbidden port before returning a Fetch-safe ephemeral listener', async () => {
    const boundPorts = [4045, 4046]
    const server = {
      address: () => ({ address: '127.0.0.1', family: 'IPv4', port: boundPorts[0] }),
      close: (callback: (error?: Error) => void) => callback(),
    }
    const listen = async () => {
      const port = boundPorts.shift()
      if (port == null) throw new Error('Test listener candidates exhausted')
      server.address = () => ({ address: '127.0.0.1', family: 'IPv4', port })
    }

    await expect(listenOnFetchSafeEphemeralPort(server as unknown as Server, listen)).resolves.toBe(
      4046,
    )
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

  it('reserves a service port outside the kernel ephemeral range', async () => {
    const range = kernelEphemeralPortRange()
    const reservations = await allocateReservedPorts(1)
    try {
      const port = reservations[0]?.port
      expect(port).toEqual(expect.any(Number))
      if (typeof port !== 'number') return
      expect(port >= range.first && port <= range.last).toBe(false)
    } finally {
      await Promise.all(reservations.map(reservation => reservation.release()))
    }
  })
})
