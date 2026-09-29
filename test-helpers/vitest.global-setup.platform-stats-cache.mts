import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { parse } from 'yaml'
import type { TestProject } from 'vitest/node'

const ownershipLabel = 'voucha.platform-stats-cache'
const startupTimeout = 30_000

function docker(args: string[]): string {
  return execFileSync('docker', args, { timeout: startupTimeout }).toString().trim()
}

function valkeyImage(): string {
  const workflow = parse(
    readFileSync(new URL('../.github/workflows/tests-backend-unit.yml', import.meta.url), 'utf8'),
  ) as { jobs?: { 'backend-tests'?: { services?: { valkey?: { image?: unknown } } } } }
  const image = workflow.jobs?.['backend-tests']?.services?.valkey?.image
  if (typeof image !== 'string' || !image) {
    throw new Error('Missing backend-tests.services.valkey.image in tests-backend-unit.yml')
  }
  return image
}

function watchHealth(containerId: string, since: string) {
  const child = spawn(
    'docker',
    ['events', '--since', since, '--filter', `container=${containerId}`, '--format', '{{json .}}'],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: startupTimeout },
  )
  const lines = createInterface({ input: child.stdout })
  const ready = new Promise<void>((resolve, reject) => {
    lines.on('line', line => {
      try {
        const event = JSON.parse(line) as { Actor?: { ID?: string }; Action?: string }
        if (event.Actor?.ID !== containerId) return
        if (event.Action === 'health_status: healthy') resolve()
        if (['health_status: unhealthy', 'die', 'destroy'].includes(event.Action ?? '')) {
          reject(new Error(`Private platform-stats Valkey failed: ${event.Action}`))
        }
      } catch (cause) {
        reject(
          cause instanceof Error
            ? cause
            : new Error('Private platform-stats Valkey log line was not valid JSON'),
        )
      }
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      reject(new Error(`Private platform-stats Valkey health watcher exited (${code}, ${signal})`))
    })
  })
  return {
    ready,
    stop() {
      lines.close()
      child.kill()
    },
  }
}

function removeOwnedContainer(containerId: string, owner: string): void {
  const label = docker([
    'inspect',
    '--format',
    `{{index .Config.Labels "${ownershipLabel}"}}`,
    containerId,
  ])
  if (label !== owner)
    throw new Error('Refusing to remove a foreign platform-stats cache container')
  docker(['rm', '--force', containerId])
}

export default async function setup(project: Pick<TestProject, 'provide'>) {
  const owner = randomUUID()
  const since = new Date().toISOString()
  const name = `voucha-platform-stats-${owner}`
  let containerId: string | undefined
  try {
    const createdId = docker([
      'create',
      '--name',
      name,
      '--label',
      `${ownershipLabel}=${owner}`,
      '--publish',
      '127.0.0.1::6379',
      '--health-cmd',
      'valkey-cli ping',
      '--health-interval',
      '250ms',
      '--health-timeout',
      '1s',
      '--health-retries',
      '50',
      valkeyImage(),
      'valkey-server',
      '--save',
      '',
      '--appendonly',
      'no',
    ])
    if (!/^[a-f0-9]{64}$/.test(createdId)) throw new Error('Docker did not return a container ID')
    containerId = createdId
    const health = watchHealth(containerId, since)
    try {
      await Promise.all([health.ready, Promise.resolve().then(() => docker(['start', createdId]))])
    } finally {
      health.stop()
    }
    const ports = JSON.parse(
      docker(['inspect', '--format', '{{json .NetworkSettings.Ports}}', containerId]),
    ) as Record<string, { HostIp: string; HostPort: string }[]>
    const binding = ports['6379/tcp']?.[0]
    const port = Number(binding?.HostPort)
    if (binding?.HostIp !== '127.0.0.1' || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Private platform-stats Valkey did not bind an assigned localhost port')
    }
    project.provide('platformStatsCache', { url: `redis://127.0.0.1:${port}`, owner })
    return () => removeOwnedContainer(createdId, owner)
  } catch (cause) {
    try {
      containerId ??=
        docker([
          'ps',
          '--all',
          '--no-trunc',
          '--filter',
          `name=^/${name}$`,
          '--filter',
          `label=${ownershipLabel}=${owner}`,
          '--format',
          '{{.ID}}',
        ]) || undefined
      if (containerId) {
        if (!/^[a-f0-9]{64}$/.test(containerId))
          throw new Error('Ambiguous owned cache container recovery', { cause })
        removeOwnedContainer(containerId, owner)
      }
    } catch (cleanupError) {
      throw new AggregateError(
        [cause, cleanupError],
        'Private platform-stats cache startup and cleanup failed',
        { cause: cleanupError },
      )
    }
    throw cause
  }
}
