import net from 'node:net'
import { listenOnEphemeralPort } from '@ts-shared/utils/ephemeral-ports'
import { isFetchSafePort } from '@ts-shared/utils/fetch-ports'

export { isFetchSafePort } from '@ts-shared/utils/fetch-ports'

export interface ReservedPort {
  port: number
  release: () => Promise<void>
}

type ReservePorts = (count: number) => Promise<ReservedPort[]>
type ListenOnLoopback = (server: net.Server, port: number) => Promise<void>

export async function allocateReservedPorts(
  count: number,
  reservePorts: ReservePorts = reserveLoopbackPorts,
): Promise<ReservedPort[]> {
  const reservations: ReservedPort[] = []
  try {
    while (reservations.length < count) {
      // eslint-disable-next-line no-await-in-loop -- safe reservations remain bound while a replacement batch is allocated atomically.
      const candidates = await reservePorts(count - reservations.length)
      const forbiddenCandidates: ReservedPort[] = []
      for (const candidate of candidates) {
        if (isFetchSafePort(candidate.port)) {
          reservations.push(candidate)
        } else {
          forbiddenCandidates.push(candidate)
        }
      }
      // Wait for every release so one rejection cannot let cleanup finish while another close is still pending.
      // eslint-disable-next-line no-await-in-loop -- forbidden candidates must close before allocating their replacements.
      const releaseResults = await Promise.allSettled(
        forbiddenCandidates.map(candidate => candidate.release()),
      )
      const failedRelease = releaseResults.find(result => result.status === 'rejected')
      if (failedRelease) {
        throw failedRelease.reason
      }
    }

    return reservations
  } catch (error) {
    await Promise.allSettled(reservations.map(reservation => reservation.release()))
    throw error
  }
}

export async function listenOnFetchSafeEphemeralPort(
  server: net.Server,
  listen: ListenOnLoopback = listenOnLoopback,
): Promise<number> {
  return listenOnEphemeralPort(server, '127.0.0.1', {
    isAllowedPort: isFetchSafePort,
    listen: async candidate => listen(candidate, 0),
  })
}

async function reserveLoopbackPorts(count: number): Promise<ReservedPort[]> {
  const servers = await Promise.all(
    Array.from({ length: count }, async () => {
      const server = net.createServer()
      await listenOnEphemeralPort(server, '127.0.0.1')
      return server
    }),
  )

  return servers.map(toReservedPort)
}

function toReservedPort(server: net.Server): ReservedPort {
  return {
    port: getBoundPort(server),
    release: () => closeServer(server),
  }
}

function getBoundPort(server: net.Server): number {
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to allocate port')
  }
  return address.port
}

function listenOnLoopback(server: net.Server, port: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}
