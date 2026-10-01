import { execFileSync } from 'node:child_process'
import { randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import net from 'node:net'
import { listenOnEphemeralPort } from '@ts-shared/utils/ephemeral-ports'
import { isFetchSafePort } from '@ts-shared/utils/fetch-ports'

const LOWEST_UNPRIVILEGED_PORT = 1024
const HIGHEST_PORT = 65535

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
  } catch (err) {
    await Promise.allSettled(reservations.map(reservation => reservation.release()))
    throw err
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

// A listen(0) port is inside the kernel ephemeral range. After this reservation is
// released, the child process spends its startup on imports and localhost
// connections before it binds. The kernel can hand that same port out as a
// connect() source port, and the later listen — including the API's '::' bind —
// then fails with EADDRINUSE. Ports outside the range are not auto-assigned.
async function reserveLoopbackPorts(count: number): Promise<ReservedPort[]> {
  const band = servicePortBand(readKernelEphemeralPortRange())
  const servers: net.Server[] = []
  const bandSize = band.end - band.start + 1
  let port = band.start + randomInt(bandSize)
  let examined = 0
  try {
    while (servers.length < count && examined < bandSize) {
      const candidate = port
      port = candidate === band.end ? band.start : candidate + 1
      examined += 1
      if (!isFetchSafePort(candidate)) continue
      // eslint-disable-next-line no-await-in-loop -- a failed bind must settle before the next candidate is tried
      const server = await tryReserveLoopback(candidate)
      if (server) servers.push(server)
    }
  } catch (err) {
    await Promise.allSettled(servers.map(server => closeServer(server)))
    throw err
  }
  if (servers.length < count) {
    await Promise.allSettled(servers.map(server => closeServer(server)))
    throw new Error(`Failed to reserve ${count} service ports outside the kernel ephemeral range`)
  }
  return servers.map(toReservedPort)
}

function servicePortBand(range: { first: number; last: number }): { start: number; end: number } {
  if (range.first > LOWEST_UNPRIVILEGED_PORT) {
    return { start: LOWEST_UNPRIVILEGED_PORT, end: range.first - 1 }
  }
  if (range.last < HIGHEST_PORT) {
    return { start: range.last + 1, end: HIGHEST_PORT }
  }
  throw new Error(
    `Kernel ephemeral port range ${range.first}-${range.last} covers every unprivileged port`,
  )
}

function readKernelEphemeralPortRange(): { first: number; last: number } {
  if (process.platform === 'linux') {
    const text = readFileSync('/proc/sys/net/ipv4/ip_local_port_range', 'utf8').trim()
    const match = /^(\d+)\s+(\d+)$/.exec(text)
    if (!match) throw new Error(`Unreadable kernel ephemeral port range: ${text}`)
    return { first: Number(match[1]), last: Number(match[2]) }
  }
  if (process.platform === 'darwin') {
    return {
      first: readDarwinPortRange('net.inet.ip.portrange.first'),
      last: readDarwinPortRange('net.inet.ip.portrange.last'),
    }
  }
  throw new Error(`Cannot read the kernel ephemeral port range on ${process.platform}`)
}

function readDarwinPortRange(name: string): number {
  const value = Number(execFileSync('sysctl', ['-n', name], { encoding: 'utf8' }).trim())
  if (!Number.isInteger(value)) throw new Error(`Unreadable Darwin port range ${name}`)
  return value
}

async function tryReserveLoopback(port: number): Promise<net.Server | null> {
  const server = net.createServer()
  try {
    await listenOnLoopback(server, port)
    return server
  } catch (err) {
    if (isAddrInUse(err)) return null
    throw err
  }
}

function isAddrInUse(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EADDRINUSE'
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
